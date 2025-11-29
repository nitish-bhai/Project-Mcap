import React, { useState } from 'react';
import MotionProcessor from './components/MotionProcessor';

function App() {
  const [activeTab, setActiveTab] = useState<'app' | 'help'>('app');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
              <i className="fas fa-running text-white text-xl"></i>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">MocapGen AI</h1>
              <p className="text-xs text-slate-400">Video to Blender Pipeline</p>
            </div>
          </div>
          <nav className="flex gap-1 bg-slate-700/50 p-1 rounded-lg">
            <button 
              onClick={() => setActiveTab('app')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${activeTab === 'app' ? 'bg-blue-600 text-white shadow-sm' : 'hover:text-white'}`}
            >
              Studio
            </button>
            <button 
              onClick={() => setActiveTab('help')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${activeTab === 'help' ? 'bg-blue-600 text-white shadow-sm' : 'hover:text-white'}`}
            >
              Blender Guide
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {activeTab === 'app' ? (
          <MotionProcessor />
        ) : (
          <div className="max-w-3xl mx-auto bg-slate-800 p-8 rounded-xl border border-slate-700 shadow-xl">
            <h2 className="text-2xl font-bold text-white mb-6">How to use with Blender</h2>
            
            <div className="space-y-8">
              <section>
                <h3 className="text-lg font-semibold text-blue-400 mb-2">1. Importing the BVH</h3>
                <p className="text-slate-300 leading-relaxed mb-4">
                  After downloading the <code className="bg-slate-900 px-1 py-0.5 rounded text-sm font-mono">.bvh</code> file from MocapGen:
                </p>
                <ol className="list-decimal list-inside space-y-2 text-slate-300 ml-4">
                  <li>Open Blender.</li>
                  <li>Go to <strong>File &gt; Import &gt; Motion Capture (.bvh)</strong>.</li>
                  <li>Select your downloaded file.</li>
                  <li>In the Import settings (right sidebar in file dialog), set <strong>Scale</strong> to roughly <strong>0.01</strong> (MocapGen exports in centimeters, Blender uses Meters).</li>
                  <li>Click <strong>Import BVH</strong>.</li>
                </ol>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-blue-400 mb-2">2. Why does the skeleton look disconnected?</h3>
                <p className="text-slate-300 leading-relaxed">
                  MocapGen exports a "Positional BVH". This means every joint has absolute position data derived from the AI. 
                  This is often more accurate than trying to guess rotations. 
                  In Blender, the bones might look detached if you move them, but the animation is correct.
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-blue-400 mb-2">3. Retargeting to a Character</h3>
                <p className="text-slate-300 leading-relaxed mb-4">
                  To apply this motion to your own character (Rigify, Mixamo, etc.):
                </p>
                <ul className="list-disc list-inside space-y-2 text-slate-300 ml-4">
                  <li>Align your character's rig with the BVH skeleton in the first frame.</li>
                  <li>Use "Copy Location" constraints for the hips/root.</li>
                  <li>Use "Copy Location" constraints for IK controllers (Hands/Feet).</li>
                  <li>Or use a retargeting add-on like <strong>Rokoko</strong> or <strong>Auto-Rig Pro</strong> which handle BVH retargeting automatically.</li>
                </ul>
              </section>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-8 text-slate-500 text-sm">
        <p>Processed locally in your browser using TensorFlow/MediaPipe.</p>
      </footer>
    </div>
  );
}

export default App;