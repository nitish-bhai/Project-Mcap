import { MocapFrame, Landmark3D } from '../types';

/**
 * Applies a simple exponential moving average (Low Pass Filter) to the frames.
 * @param frames Raw extracted frames
 * @param alpha Smoothing factor (0.1 = very smooth/slow, 0.9 = responsive/jittery)
 */
export const smoothFrames = (frames: MocapFrame[], alpha: number = 0.5): MocapFrame[] => {
  if (frames.length === 0) return [];

  const smoothedFrames: MocapFrame[] = [];
  
  // Initialize with first frame
  let previousLandmarks: Landmark3D[] = frames[0].landmarks.map(l => ({ ...l }));
  smoothedFrames.push({
    timestamp: frames[0].timestamp,
    landmarks: previousLandmarks
  });

  for (let i = 1; i < frames.length; i++) {
    const currentFrame = frames[i];
    const smoothedLandmarks: Landmark3D[] = [];

    for (let j = 0; j < currentFrame.landmarks.length; j++) {
      const curr = currentFrame.landmarks[j];
      const prev = previousLandmarks[j];

      // Simple interpolation for missing data (visibility check could be added here)
      // Exponential Moving Average: S_t = alpha * Y_t + (1 - alpha) * S_{t-1}
      const newX = alpha * curr.x + (1 - alpha) * prev.x;
      const newY = alpha * curr.y + (1 - alpha) * prev.y;
      const newZ = alpha * curr.z + (1 - alpha) * prev.z;

      smoothedLandmarks.push({ x: newX, y: newY, z: newZ, visibility: curr.visibility });
    }

    smoothedFrames.push({
      timestamp: currentFrame.timestamp,
      landmarks: smoothedLandmarks
    });
    
    previousLandmarks = smoothedLandmarks;
  }

  return smoothedFrames;
};