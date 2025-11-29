import { MocapFrame, MP_POSE } from '../types';

/**
 * A simplified BVH exporter.
 * 
 * Note: Generating a full rotational hierarchy (Euler angles) from raw 3D points 
 * without a complex Inverse Kinematics solver is error-prone and often leads to gimbal lock or flipping.
 * 
 * Strategy: We export a "Positional" BVH. 
 * We define a standard hierarchy, but every joint uses 6DOF (Position + Rotation) or just Position.
 * This allows Blender to import the exact 3D positions of the joints.
 * Users can then use "Child Of" constraints or Retargeting tools in Blender to drive a rig.
 */

export const generateBVH = (frames: MocapFrame[]): string => {
  if (!frames || frames.length === 0) return "";

  const fps = 30; // Assumed standard
  const frameTime = (1 / fps).toFixed(6);

  // Define hierarchy names matching MediaPipe indices roughly
  // We will map MP indices to Bone Names
  const joints = [
    { name: "Hips", parent: null, mpIndex: -1 }, // Root, we will calculate center of hips
    { name: "Spine", parent: "Hips", mpIndex: -1 }, // Midpoint shoulders/hips
    { name: "Head", parent: "Spine", mpIndex: MP_POSE.NOSE },
    { name: "LeftShoulder", parent: "Spine", mpIndex: MP_POSE.LEFT_SHOULDER },
    { name: "LeftElbow", parent: "LeftShoulder", mpIndex: MP_POSE.LEFT_ELBOW },
    { name: "LeftWrist", parent: "LeftElbow", mpIndex: MP_POSE.LEFT_WRIST },
    { name: "RightShoulder", parent: "Spine", mpIndex: MP_POSE.RIGHT_SHOULDER },
    { name: "RightElbow", parent: "RightShoulder", mpIndex: MP_POSE.RIGHT_ELBOW },
    { name: "RightWrist", parent: "RightElbow", mpIndex: MP_POSE.RIGHT_WRIST },
    { name: "LeftHip", parent: "Hips", mpIndex: MP_POSE.LEFT_HIP },
    { name: "LeftKnee", parent: "LeftHip", mpIndex: MP_POSE.LEFT_KNEE },
    { name: "LeftAnkle", parent: "LeftKnee", mpIndex: MP_POSE.LEFT_ANKLE },
    { name: "RightHip", parent: "Hips", mpIndex: MP_POSE.RIGHT_HIP },
    { name: "RightKnee", parent: "RightHip", mpIndex: MP_POSE.RIGHT_KNEE },
    { name: "RightAnkle", parent: "RightKnee", mpIndex: MP_POSE.RIGHT_ANKLE },
  ];

  let bvh = "HIERARCHY\n";
  let indentation = 0;
  const indentStr = () => "  ".repeat(indentation);

  // Recursive function to write hierarchy
  const writeJoint = (jointName: string) => {
    const joint = joints.find(j => j.name === jointName);
    if (!joint) return;

    // Root is special
    if (joint.parent === null) {
      bvh += `ROOT ${joint.name}\n{\n`;
    } else {
      bvh += `${indentStr()}JOINT ${joint.name}\n${indentStr()}{\n`;
    }
    
    indentation++;
    bvh += `${indentStr()}OFFSET 0.00 0.00 0.00\n`; // We are using absolute positioning for simplicity in this approach
    
    // Using 3 positional channels + 3 rotational (placeholder) for maximum flexibility in Blender
    bvh += `${indentStr()}CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation\n`;

    // Find children
    const children = joints.filter(j => j.parent === jointName);
    if (children.length > 0) {
      children.forEach(c => writeJoint(c.name));
    } else {
      // End Site
      bvh += `${indentStr()}End Site\n${indentStr()}{\n`;
      indentation++;
      bvh += `${indentStr()}OFFSET 0.00 0.00 0.00\n`;
      indentation--;
      bvh += `${indentStr()}}\n`;
    }

    indentation--;
    bvh += `${indentStr()}}\n`;
  };

  writeJoint("Hips");

  bvh += "MOTION\n";
  bvh += `Frames: ${frames.length}\n`;
  bvh += `Frame Time: ${frameTime}\n`;

  // Write Frame Data
  // MediaPipe World Landmarks are in Meters. 
  // BVH usually likes Centimeters or Meters. Let's stick to processed values (approx meters).
  // We flip Y because MediaPipe Y points down in 2D, but WorldLandmarks Y points up? 
  // Actually MP Pose World: Y is gravity negative.
  
  for (const frame of frames) {
    let line = "";
    
    // We need to compute positions for our virtual joints
    const lm = frame.landmarks;
    
    // Helpers
    const getPos = (idx: number) => {
      if (idx < 0 || idx >= lm.length) return { x: 0, y: 0, z: 0 };
      // MediaPipe: +Y is down usually in screen space, but WorldLandmarks are metric relative to hip.
      // We flip Y and Scale for Blender (approx scale)
      const scale = 100; // Convert meters to cm
      return {
        x: lm[idx].x * -scale, // Mirror X for standard view
        y: lm[idx].y * -scale, // Flip Y
        z: lm[idx].z * scale 
      };
    };

    const lHip = getPos(MP_POSE.LEFT_HIP);
    const rHip = getPos(MP_POSE.RIGHT_HIP);
    const lShoulder = getPos(MP_POSE.LEFT_SHOULDER);
    const rShoulder = getPos(MP_POSE.RIGHT_SHOULDER);

    // Calculated virtual joints
    const hips = {
      x: (lHip.x + rHip.x) / 2,
      y: (lHip.y + rHip.y) / 2,
      z: (lHip.z + rHip.z) / 2,
    };

    const spine = {
      x: (lShoulder.x + rShoulder.x) / 2,
      y: (lShoulder.y + rShoulder.y) / 2,
      z: (lShoulder.z + rShoulder.z) / 2,
    };

    const positions: Record<string, {x:number, y:number, z:number}> = {
      Hips: hips,
      Spine: spine,
      Head: getPos(MP_POSE.NOSE),
      LeftShoulder: lShoulder,
      LeftElbow: getPos(MP_POSE.LEFT_ELBOW),
      LeftWrist: getPos(MP_POSE.LEFT_WRIST),
      RightShoulder: rShoulder,
      RightElbow: getPos(MP_POSE.RIGHT_ELBOW),
      RightWrist: getPos(MP_POSE.RIGHT_WRIST),
      LeftHip: lHip,
      LeftKnee: getPos(MP_POSE.LEFT_KNEE),
      LeftAnkle: getPos(MP_POSE.LEFT_ANKLE),
      RightHip: rHip,
      RightKnee: getPos(MP_POSE.RIGHT_KNEE),
      RightAnkle: getPos(MP_POSE.RIGHT_ANKLE),
    };

    // Write data in order of hierarchy traversal
    const writeData = (jointName: string) => {
       const p = positions[jointName] || { x:0, y:0, z:0 };
       // Write Pos X Y Z, Rot Z X Y (Rot is 0 for this positional export)
       line += `${p.x.toFixed(4)} ${p.y.toFixed(4)} ${p.z.toFixed(4)} 0.00 0.00 0.00 `;
       
       const children = joints.filter(j => j.parent === jointName);
       children.forEach(c => writeData(c.name));
    };

    writeData("Hips");
    bvh += line.trim() + "\n";
  }

  return bvh;
};