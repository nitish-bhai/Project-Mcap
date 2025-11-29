export interface Landmark3D {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface MocapFrame {
  timestamp: number;
  landmarks: Landmark3D[];
}

export interface ProjectData {
  id?: string;
  name: string;
  videoUrl: string;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  progress: number;
  frames?: MocapFrame[];
  createdAt: number;
}

export enum ProcessingStage {
  IDLE = 'IDLE',
  LOADING_MODEL = 'LOADING_MODEL',
  PROCESSING_VIDEO = 'PROCESSING_VIDEO',
  SMOOTHING = 'SMOOTHING',
  COMPLETED = 'COMPLETED',
}

// MediaPipe Pose Landmark Indices
export const MP_POSE = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
};