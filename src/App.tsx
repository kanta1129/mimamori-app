import { useEffect, useRef, useState } from 'react';
import { Pose, Results, POSE_CONNECTIONS } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
// ★ Teachable Machineのライブラリをインポート
import * as tmPose from '@teachablemachine/pose';

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // ★ モデルを保持するState
  const [model, setModel] = useState<tmPose.CustomPoseNet | null>(null);

  const [status, setStatus] = useState<string>('モデル読み込み中... ⏳');
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [isFallDetected, setIsFallDetected] = useState<boolean>(false);

  // ----------------------------------------------------------------
  // ★ 1. モデルのロード処理
  // ----------------------------------------------------------------
  useEffect(() => {
    const loadModel = async () => {
      // publicフォルダに配置したパスを指定
      const modelURL = "./my-pose-model/model.json";
      const metadataURL = "./my-pose-model/metadata.json";

      try {
        // Teachable Machineのモデルをロード
        const loadedModel = await tmPose.load(modelURL, metadataURL);
        setModel(loadedModel);
        setStatus('モニタリング準備完了 🟢');
        console.log("Model Loaded!");
      } catch (error) {
        console.error("モデルの読み込みに失敗しました:", error);
        setStatus('❌ モデル読み込みエラー');
      }
    };

    loadModel();
  }, []);

  // ----------------------------------------------------------------
  // ★ 2. AIによる推論処理
  // ----------------------------------------------------------------
  const predict = async () => {
    if (!model || !videoRef.current) return;

    // Teachable Machineで推論を実行
    // estimatePoseは { pose: ..., posenetOutput: ... } を返すが、
    // ここでは predict メソッドを使ってクラス確率を取得する
    const { prediction } = await model.estimatePose(videoRef.current);

    // prediction は [{ className: "Standing", probability: 0.99 }, ...] の配列
    
    // 最も確率が高いクラスを探す
    let highestProb = 0;
    let bestClass = "";

    prediction.forEach((p) => {
      if (p.probability > highestProb) {
        highestProb = p.probability;
        bestClass = p.className;
      }
    });

    // デバッグ表示: 全クラスの確率を表示
    const debugText = prediction
      .map(p => `${p.className}: ${(p.probability * 100).toFixed(1)}%`)
      .join(' / ');
    setDebugInfo(debugText);

    // ★ 判定ロジック (クラス名はTeachableMachineで設定したものに合わせてください)
    // 例: "Fall", "Standing", "Sitting" など
    if (bestClass === "Fall" && highestProb > 0.85) { // 85%以上の確信度で転倒
      setStatus('⚠️ 転倒検知 (AI判定)');
      setIsFallDetected(true);
      // ここでサーバー送信処理などを呼ぶ
    } else {
      setStatus(`モニタリング中: ${bestClass}`);
      setIsFallDetected(false);
    }
  };

  // ----------------------------------------------------------------
  // MediaPipeの設定 (描画用)
  // Teachable Machineにも姿勢検知は入っていますが、
  // MediaPipeの方が描画が綺麗なので、可視化用として残します。
  // ※重い場合はMediaPipeを削除してTMの描画機能だけ使うことも可能です。
  // ----------------------------------------------------------------
  useEffect(() => {
    const pose = new Pose({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
      },
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    pose.onResults((results: Results) => {
      if (!canvasRef.current || !videoRef.current) return;
      const canvasCtx = canvasRef.current.getContext('2d');
      if (!canvasCtx) return;

      const canvasWidth = canvasRef.current.width;
      const canvasHeight = canvasRef.current.height;

      // 描画
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      
      // 映像を描画
      canvasCtx.drawImage(results.image, 0, 0, canvasWidth, canvasHeight);

      // 骨格を描画
      if (results.poseLandmarks) {
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {
          color: '#00FF00',
          lineWidth: 4,
        });
        drawLandmarks(canvasCtx, results.poseLandmarks, {
          color: '#FF0000',
          lineWidth: 2,
        });
      }
      
      // 転倒時は画面全体を赤枠で囲むエフェクト
      if (isFallDetected) {
        canvasCtx.strokeStyle = 'red';
        canvasCtx.lineWidth = 10;
        canvasCtx.strokeRect(0, 0, canvasWidth, canvasHeight);
      }

      canvasCtx.restore();
    });

    if (videoRef.current) {
      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (videoRef.current) {
            // 1. MediaPipeへ映像を送る (描画用)
            await pose.send({ image: videoRef.current });
            
            // ★ 2. Teachable Machineで推論する (判定用)
            // モデルのロードが完了していれば実行
            if (model) {
              await predict();
            }
          }
        },
        width: 1280,
        height: 720,
      });
      camera.start();
    }
  }, [model, isFallDetected]); // modelやstateが変わった時に最新の状態を参照できるように依存配列に追加

  return (
    <div style={{ textAlign: 'center', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>高齢者見守りシステム (AIモデル判定版)</h1>
      
      {/* ステータス表示パネル */}
      <div style={{ 
        margin: '0 auto 20px',
        padding: '15px',
        maxWidth: '800px',
        backgroundColor: status.includes('転倒') ? '#ffcdd2' : '#e8f5e9',
        border: `3px solid ${status.includes('転倒') ? 'red' : 'green'}`,
        borderRadius: '10px',
      }}>
        <h2 style={{ margin: 0, color: '#333' }}>{status}</h2>
        <p style={{ margin: '10px 0 0', fontSize: '14px', color: '#666', fontFamily: 'monospace' }}>
          AI確信度: {debugInfo}
        </p>
      </div>

      {/* 映像エリア */}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <video ref={videoRef} style={{ display: 'none' }} autoPlay playsInline></video>
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          style={{
            width: '100%',
            maxWidth: '800px',
            border: '2px solid #333',
            borderRadius: '8px'
          }}
        ></canvas>
      </div>
    </div>
  );
}

export default App;