import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import ThreeVisualizer from './ThreeVisualizer';
import { MocapFrame, ProcessingStage } from '../types';
import { smoothFrames } from '../services/smoothing';
import { generateBVH } from '../services/bvhExporter';
import { generateFBX } from '../services/fbxExporter';

const MotionProcessor: React.FC = () => {
  // State
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [frames, setFrames] = useState<MocapFrame[]>([]);
  const [stage, setStage] = useState<ProcessingStage>(ProcessingStage.IDLE);
  const [progress, setProgress] = useState(0);
  
  // Playback State
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackRef = useRef<number>();

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);

  // 1. Initialize AI Model
  useEffect(() => {
    const loadModel = async () => {
      setStage(ProcessingStage.LOADING_MODEL);
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        
        poseLandmarkerRef.current = landmarker;
        setStage(ProcessingStage.IDLE);
      } catch (err) {
        console.error("Failed to load MediaPipe model:", err);
        setStage(ProcessingStage.IDLE); // Reset so UI doesn't get stuck
        alert("Failed to load AI model. Check console for details.");
      }
    };

    loadModel();
  }, []);

  // 2. Handle File Upload
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setFrames([]);
      setStage(ProcessingStage.IDLE);
      setCurrentFrameIndex(0);
      setIsPlaying(false);
    }
  };

  // 3. Process Video
  const startProcessing = async () => {
    if (!videoRef.current || !poseLandmarkerRef.current) {
      if (!poseLandmarkerRef.current) alert("Model not loaded yet. Please wait.");
      return;
    }
    
    setStage(ProcessingStage.PROCESSING_VIDEO);
    const video = videoRef.current;
    
    // Ensure video is ready
    if (video.readyState < 2) {
      await new Promise(resolve => {
        video.onloadeddata = resolve;
      });
    }

    const duration = video.duration;
    // We process at a fixed step to ensure consistent BVH output
    const fps = 30; 
    const interval = 1.0 / fps;
    let currentTime = 0;
    
    const rawFrames: MocapFrame[] = [];

    // Seek and detect loop
    try {
      while (currentTime < duration) {
        // Seek video
        video.currentTime = currentTime;
        await new Promise(r => video.onseeked = r);

        // Detect
        const result = poseLandmarkerRef.current.detectForVideo(video, currentTime * 1000);
        
        if (result.worldLandmarks && result.worldLandmarks.length > 0) {
          rawFrames.push({
            timestamp: currentTime,
            landmarks: result.worldLandmarks[0] // Assume single person
          });
        } else {
            // Push empty frame or last known frame to maintain timing?
            // For now, let's skip, but ideally we interpolate later
        }

        // Progress Update
        setProgress(Math.round((currentTime / duration) * 100));
        currentTime += interval;
        
        // Small yield to UI
        await new Promise(r => setTimeout(r, 0));
      }

      setStage(ProcessingStage.SMOOTHING);
      // 4. Smooth Data
      // Use a slight delay for smoothing to show stage transition
      await new Promise(r => setTimeout(r, 100));
      
      const smoothed = smoothFrames(rawFrames, 0.6);
      setFrames(smoothed);
      setStage(ProcessingStage.COMPLETED);
      setIsPlaying(true);
      
    } catch (e) {
      console.error("Processing error:", e);
      setStage(ProcessingStage.IDLE);
      alert("Error processing video.");
    }
  };

  // 5. Playback Loop
  useEffect(() => {
    if (isPlaying && frames.length > 0) {
      playbackRef.current = window.setInterval(() => {
        setCurrentFrameIndex(prev => (prev + 1) % frames.length);
      }, 33); // ~30fps
    } else {
      clearInterval(playbackRef.current);
    }
    return () => clearInterval(playbackRef.current);
  }, [isPlaying, frames]);

  // 6. Exports
  const handleDownloadBVH = () => {
    if (frames.length === 0) return;
    const bvhContent = generateBVH(frames);
    const blob = new Blob([bvhContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mocap-animation-${Date.now()}.bvh`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadFBX = async () => {
    if (frames.length === 0) return;
    
    // Show loading state if needed, though FBX gen is usually fast
    try {
        const buffer = await generateFBX(frames);
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mocap-animation-${Date.now()}.fbx`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error("FBX Export failed", e);
        alert("FBX Export failed. See console.");
    }
  };

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Top Controls */}
      <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          
          <div className="flex items-center gap-4">
             <label className="flex flex-col items-center px-4 py-2 bg-slate-700 text-blue-400 rounded-lg shadow-lg tracking-wide uppercase border border-blue-500 cursor-pointer hover:bg-slate-600 transition">
                <span className="text-sm font-bold"><i className="fas fa-cloud-upload-alt mr-2"></i> Select Video</span>
                <input type='file' className="hidden" accept="video/*" onChange={handleFileChange} />
            </label>
            {videoUrl && (
              <button 
                onClick={startProcessing}
                disabled={stage !== ProcessingStage.IDLE}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {stage === ProcessingStage.IDLE ? 'Extract Motion' : 'Processing...'}
              </button>
            )}
          </div>

          <div className="flex items-center gap-4">
            {stage === ProcessingStage.COMPLETED && (
              <>
                <button onClick={() => setIsPlaying(!isPlaying)} className="text-slate-200 hover:text-white text-2xl" title="Play/Pause">
                  {isPlaying ? <i className="fas fa-pause-circle"></i> : <i className="fas fa-play-circle"></i>}
                </button>
                <div className="flex gap-2">
                    <button 
                    onClick={handleDownloadBVH}
                    className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white font-bold rounded-lg transition shadow-lg text-sm"
                    >
                    <i className="fas fa-file-code mr-2"></i> .BVH
                    </button>
                    <button 
                    onClick={handleDownloadFBX}
                    className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition shadow-lg text-sm"
                    >
                    <i className="fas fa-file-export mr-2"></i> .FBX (Mixamo)
                    </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {(stage === ProcessingStage.PROCESSING_VIDEO || stage === ProcessingStage.SMOOTHING || stage === ProcessingStage.LOADING_MODEL) && (
          <div className="mt-4 w-full bg-slate-700 rounded-full h-2.5">
            <div 
                className="bg-blue-500 h-2.5 rounded-full transition-all duration-300" 
                style={{ width: stage === ProcessingStage.LOADING_MODEL ? '100%' : `${progress}%` }}
            ></div>
            <p className="text-xs text-slate-400 mt-1 text-right">
                {stage === ProcessingStage.LOADING_MODEL ? 'Loading AI Model...' : 
                 stage === ProcessingStage.SMOOTHING ? 'Stabilizing...' : 
                 `${progress}% - Analyzing...`}
            </p>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col lg:flex-row gap-6 h-[600px]">
        {/* Source Video (Hidden during processing if desired, but good for debug) */}
        <div className="flex-1 bg-black rounded-xl overflow-hidden relative border border-slate-700 flex items-center justify-center">
            {!videoUrl && <p className="text-slate-500">No video selected</p>}
            {videoUrl && (
              <video 
                ref={videoRef} 
                src={videoUrl} 
                className="max-h-full max-w-full"
                controls={false} // We control manually during processing
                muted
                playsInline
              />
            )}
            <div className="absolute top-2 left-2 bg-black/50 px-2 py-1 rounded text-xs text-white">Input Source</div>
        </div>

        {/* 3D Result */}
        <div className="flex-1 bg-black rounded-xl overflow-hidden relative border border-slate-700">
           <ThreeVisualizer frames={frames} isPlaying={isPlaying} currentFrameIndex={currentFrameIndex} />
           <div className="absolute top-2 left-2 bg-black/50 px-2 py-1 rounded text-xs text-white">3D Reconstruction</div>
        </div>
      </div>
    </div>
  );
};

export default MotionProcessor;