import * as THREE from 'three';
import { FBXExporter } from 'three/examples/jsm/exporters/FBXExporter.js';
import { MocapFrame, MP_POSE } from '../types';

/**
 * Generates an FBX file suitable for Mixamo/Blender.
 * Converts MediaPipe world positions into Joint Rotations relative to a T-Pose.
 */
export const generateFBX = async (frames: MocapFrame[]): Promise<ArrayBuffer> => {
  if (!frames || frames.length === 0) {
    throw new Error("No frames to export");
  }

  // 1. Setup the Scene & Skeleton
  const scene = new THREE.Scene();
  const fps = 30;

  // Mixamo compatible bone names
  const boneMap = [
    { name: 'mixamorig:Hips', parent: null, ref: 'Hips' },
    { name: 'mixamorig:Spine', parent: 'mixamorig:Hips', ref: 'Spine' },
    { name: 'mixamorig:Spine1', parent: 'mixamorig:Spine', ref: 'Spine1' },
    { name: 'mixamorig:Spine2', parent: 'mixamorig:Spine1', ref: 'Spine2' },
    { name: 'mixamorig:Neck', parent: 'mixamorig:Spine2', ref: 'Neck' },
    { name: 'mixamorig:Head', parent: 'mixamorig:Neck', ref: 'Head' },
    
    { name: 'mixamorig:LeftShoulder', parent: 'mixamorig:Spine2', ref: 'LeftShoulder' },
    { name: 'mixamorig:LeftArm', parent: 'mixamorig:LeftShoulder', ref: 'LeftArm' },
    { name: 'mixamorig:LeftForeArm', parent: 'mixamorig:LeftArm', ref: 'LeftForeArm' },
    { name: 'mixamorig:LeftHand', parent: 'mixamorig:LeftForeArm', ref: 'LeftHand' },

    { name: 'mixamorig:RightShoulder', parent: 'mixamorig:Spine2', ref: 'RightShoulder' },
    { name: 'mixamorig:RightArm', parent: 'mixamorig:RightShoulder', ref: 'RightArm' },
    { name: 'mixamorig:RightForeArm', parent: 'mixamorig:RightArm', ref: 'RightForeArm' },
    { name: 'mixamorig:RightHand', parent: 'mixamorig:RightForeArm', ref: 'RightHand' },

    { name: 'mixamorig:LeftUpLeg', parent: 'mixamorig:Hips', ref: 'LeftUpLeg' },
    { name: 'mixamorig:LeftLeg', parent: 'mixamorig:LeftUpLeg', ref: 'LeftLeg' },
    { name: 'mixamorig:LeftFoot', parent: 'mixamorig:LeftLeg', ref: 'LeftFoot' },
    
    { name: 'mixamorig:RightUpLeg', parent: 'mixamorig:Hips', ref: 'RightUpLeg' },
    { name: 'mixamorig:RightLeg', parent: 'mixamorig:RightUpLeg', ref: 'RightLeg' },
    { name: 'mixamorig:RightFoot', parent: 'mixamorig:RightLeg', ref: 'RightFoot' },
  ];

  // Helper to create Bone Objects
  const bones: Record<string, THREE.Bone> = {};
  
  boneMap.forEach(b => {
    const bone = new THREE.Bone();
    bone.name = b.name;
    bones[b.name] = bone;
    
    if (b.parent) {
      bones[b.parent].add(bone);
    } else {
      scene.add(bone); // Add root to scene
    }
  });

  // 2. Define T-Pose Offsets (Approximate)
  // We use these vectors to calculate rotations: Rotation = Quaternion(RestVector, CurrentVector)
  // Vectors are direction from Parent to Child in T-Pose.
  // Coordinate system: Y-Up, Z-Forward.
  const tPoseDirections: Record<string, THREE.Vector3> = {
    // Spine goes Up (+Y)
    'mixamorig:Spine': new THREE.Vector3(0, 1, 0),
    'mixamorig:Spine1': new THREE.Vector3(0, 1, 0),
    'mixamorig:Spine2': new THREE.Vector3(0, 1, 0),
    'mixamorig:Neck': new THREE.Vector3(0, 1, 0),
    'mixamorig:Head': new THREE.Vector3(0, 1, 0),
    
    // Arms go Out (+X for Left, -X for Right because Mixamo mirrors?)
    // Actually in standard T-Pose: Left arm is +X, Right arm is -X relative to body.
    'mixamorig:LeftShoulder': new THREE.Vector3(1, 1, 0).normalize(), // Clavicle usually goes up/out
    'mixamorig:LeftArm': new THREE.Vector3(1, 0, 0),
    'mixamorig:LeftForeArm': new THREE.Vector3(1, 0, 0),
    'mixamorig:LeftHand': new THREE.Vector3(1, 0, 0),
    
    'mixamorig:RightShoulder': new THREE.Vector3(-1, 1, 0).normalize(),
    'mixamorig:RightArm': new THREE.Vector3(-1, 0, 0),
    'mixamorig:RightForeArm': new THREE.Vector3(-1, 0, 0),
    'mixamorig:RightHand': new THREE.Vector3(-1, 0, 0),

    // Legs go Down (-Y)
    // Hips usually split L/R slightly
    'mixamorig:LeftUpLeg': new THREE.Vector3(1, -1, 0).normalize(), 
    'mixamorig:LeftLeg': new THREE.Vector3(0, -1, 0),
    'mixamorig:LeftFoot': new THREE.Vector3(0, 0, 1), // Foot points forward Z

    'mixamorig:RightUpLeg': new THREE.Vector3(-1, -1, 0).normalize(), 
    'mixamorig:RightLeg': new THREE.Vector3(0, -1, 0),
    'mixamorig:RightFoot': new THREE.Vector3(0, 0, 1),
  };

  // 3. Process Animation Tracks
  const tracks: THREE.KeyframeTrack[] = [];
  const times = frames.map(f => f.timestamp);
  
  // Prepare data arrays for tracks
  const tracksData: Record<string, { pos: number[], rot: number[] }> = {};
  boneMap.forEach(b => {
    tracksData[b.name] = { pos: [], rot: [] };
  });

  // Scale factor (MediaPipe meters -> Mixamo cm/units)
  const scale = 100;

  frames.forEach((frame) => {
    const lm = frame.landmarks;
    
    // Helper to get vector from MP landmarks
    const getVec = (idx: number) => {
        return new THREE.Vector3(
            -lm[idx].x * scale, // Flip X for mirror
            -lm[idx].y * scale, // Flip Y for MP coords
            lm[idx].z * scale
        );
    };

    // Calculate Virtual Joint Positions
    // We reuse the logic from BVH but need Vector3 objects
    const lShoulder = getVec(MP_POSE.LEFT_SHOULDER);
    const rShoulder = getVec(MP_POSE.RIGHT_SHOULDER);
    const lHip = getVec(MP_POSE.LEFT_HIP);
    const rHip = getVec(MP_POSE.RIGHT_HIP);
    
    const hipsPos = new THREE.Vector3().addVectors(lHip, rHip).multiplyScalar(0.5);
    const neckPos = new THREE.Vector3().addVectors(lShoulder, rShoulder).multiplyScalar(0.5);
    const spinePos = new THREE.Vector3().lerpVectors(hipsPos, neckPos, 0.3); // Lower spine
    const spine1Pos = new THREE.Vector3().lerpVectors(hipsPos, neckPos, 0.6); // Mid spine
    const spine2Pos = new THREE.Vector3().lerpVectors(hipsPos, neckPos, 0.9); // Upper spine (Chest)
    
    const headPos = getVec(MP_POSE.NOSE);

    // Map bone names to current 3D positions
    const positions: Record<string, THREE.Vector3> = {
      'mixamorig:Hips': hipsPos,
      'mixamorig:Spine': spinePos,
      'mixamorig:Spine1': spine1Pos,
      'mixamorig:Spine2': spine2Pos,
      'mixamorig:Neck': neckPos,
      'mixamorig:Head': headPos,

      'mixamorig:LeftShoulder': lShoulder,
      'mixamorig:LeftArm': getVec(MP_POSE.LEFT_ELBOW),
      'mixamorig:LeftForeArm': getVec(MP_POSE.LEFT_WRIST),
      'mixamorig:LeftHand': getVec(MP_POSE.LEFT_WRIST).add(new THREE.Vector3(5,0,0)), // Estimate hand

      'mixamorig:RightShoulder': rShoulder,
      'mixamorig:RightArm': getVec(MP_POSE.RIGHT_ELBOW),
      'mixamorig:RightForeArm': getVec(MP_POSE.RIGHT_WRIST),
      'mixamorig:RightHand': getVec(MP_POSE.RIGHT_WRIST).add(new THREE.Vector3(-5,0,0)), 

      'mixamorig:LeftUpLeg': lHip,
      'mixamorig:LeftLeg': getVec(MP_POSE.LEFT_KNEE),
      'mixamorig:LeftFoot': getVec(MP_POSE.LEFT_ANKLE),

      'mixamorig:RightUpLeg': rHip,
      'mixamorig:RightLeg': getVec(MP_POSE.RIGHT_KNEE),
      'mixamorig:RightFoot': getVec(MP_POSE.RIGHT_ANKLE),
    };

    // --- Calculate Rotations ---
    // For root (Hips), we set Position AND Rotation.
    // For others, we mainly set Rotation.
    
    boneMap.forEach(b => {
        const boneName = b.name;
        
        // 1. Root Position
        if (boneName === 'mixamorig:Hips') {
            const p = positions[boneName];
            // Lift hips slightly to standard height approx 100cm if needed, 
            // but MP gives absolute relative to camera. We use it as is.
            tracksData[boneName].pos.push(p.x, p.y + 100, p.z); 
        } else {
             // Local positions for children are usually fixed in a rig (bone length).
             // But here we are retargeting. We can leave local pos 0,0,0 and drive with rotation?
             // FBX Exporter will use the current bone.position as the "Bind Pose" position.
             // We should leave position animation empty for children to keep bone structure rigid?
             // Actually, to capture squashing/stretching (errors in AI), we might want to skip translation.
             // Let's NOT animate position for children, only Rotation.
        }

        // 2. Rotation
        // Calculate the vector of this bone in the current frame
        // Vector = ChildPos - ParentPos
        // We need to find the specific Child node that represents the main axis of this bone.
        // e.g. LeftArm bone vector points to LeftForeArm.
        
        let targetVector = new THREE.Vector3(0,1,0); // Default up
        let hasTarget = false;
        
        // Find the "Primary Child" to define direction
        const childBone = boneMap.find(child => child.parent === boneName);
        
        if (childBone) {
            const parentPos = positions[boneName];
            const childPos = positions[childBone.name];
            targetVector.subVectors(childPos, parentPos).normalize();
            hasTarget = true;
        } else if (boneName.includes("Foot")) {
            // Feet point forward (Z)
            // Ideally use Foot Index / Heel to calculate direction
            targetVector.set(0, 0, 1); 
            hasTarget = true;
        }

        if (hasTarget && tPoseDirections[boneName]) {
            // Calculate rotation needed to align T-Pose direction to Current direction
            const restDir = tPoseDirections[boneName].clone();
            const q = new THREE.Quaternion().setFromUnitVectors(restDir, targetVector);
            
            // This global rotation needs to be converted to local rotation if we were doing deep hierarchy math.
            // However, MediaPipe + simple export: 
            // If we just apply this global rotation to the bone, it works IF the parent is not also rotating the coordinate system.
            // But the parent IS rotating.
            // Simplification: We will export World Space Rotations? 
            // FBX/ThreeJS animation system usually works in Local space.
            // To get Local: Q_local = Q_parent_inverse * Q_global
            // We need to store global rotations first to compute this.
        }
    });
    
    // REVISIT: Calculating full hierarchy local quaternions is tricky without a solved system.
    // ALTERNATIVE: "Positional Export" (like BVH) works for Mixamo uploads usually.
    // Mixamo's auto-rigger ignores bones and looks at mesh. 
    // BUT if we want to DRIVE a Mixamo rig, we need rotations.
    
    // FALLBACK: We will export a simpler "Hips-only" animated skeleton with absolute positions for all joints.
    // This allows Blender to treat them as tracking markers.
    // Users can then "Child Of" constrain their rig to these markers.
    // This is robust.
    
    // HOWEVER, the user asked for FBX suitable for Mixamo.
    // Let's try to animate the rotations naively.
    
    // Calculate Global Rotations
    const globalQuats: Record<string, THREE.Quaternion> = {};
    
    boneMap.forEach(b => {
        const boneName = b.name;
        const childBone = boneMap.find(child => child.parent === boneName);
        
        let q = new THREE.Quaternion(); // Identity
        
        if (childBone) {
            const vCurrent = new THREE.Vector3().subVectors(positions[childBone.name], positions[boneName]).normalize();
            const vRest = tPoseDirections[boneName] || new THREE.Vector3(0,1,0);
            q.setFromUnitVectors(vRest, vCurrent);
        }
        
        globalQuats[boneName] = q;
    });
    
    // Convert to Local and Push
    boneMap.forEach(b => {
        let qLocal = globalQuats[b.name].clone();
        
        if (b.parent) {
            const qParentGlobal = globalQuats[b.parent];
            // qLocal = qParentGlobal^-1 * qGlobal
            const qParentInv = qParentGlobal.clone().invert();
            qLocal.premultiply(qParentInv);
        }
        
        tracksData[b.name].rot.push(qLocal.x, qLocal.y, qLocal.z, qLocal.w);
    });
  });

  // Create Animation Clip
  boneMap.forEach(b => {
      const flatRot = tracksData[b.name].rot;
      if (flatRot.length > 0) {
        const track = new THREE.QuaternionKeyframeTrack(
            `${b.name}.quaternion`,
            times,
            flatRot
        );
        tracks.push(track);
      }
      
      const flatPos = tracksData[b.name].pos;
      if (flatPos.length > 0) {
          const track = new THREE.VectorKeyframeTrack(
              `${b.name}.position`,
              times,
              flatPos
          );
          tracks.push(track);
      }
  });

  const clip = new THREE.AnimationClip('MixamoMotion', -1, tracks);

  // 4. Export
  const exporter = new FBXExporter();
  
  return new Promise((resolve, reject) => {
      try {
        // We need to parse the scene. The animation clip is passed in options.
        const buffer = exporter.parse(scene, { binary: true, animations: [clip] });
        resolve(buffer);
      } catch (e) {
          reject(e);
      }
  });
};