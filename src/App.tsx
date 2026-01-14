import { useEffect, useRef, useState } from 'react';
import { Pose, Results, POSE_CONNECTIONS, NormalizedLandmarkList } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // 画面に表示するステータス
  const [status, setStatus] = useState<string>('モニタリング中... 🟢');

  // 姿勢データをローカルで処理する関数
  // ここに「転倒検知」や「長時間静止」などのロジックを書きます
  const analyzePose = (landmarks: NormalizedLandmarkList) => {
    // 例: 鼻(0番)のY座標を取得 (0が上，1が下)
    const noseY = landmarks[0].y;

    // 簡易的な判定ロジックの例
    // 鼻の位置が極端に低い場合（床に近い場合）
    if (noseY > 0.8) {
      setStatus('⚠️ 転倒の可能性あり (床に近い)');
      // ここで警告音を鳴らすなどの処理も可能です
    } else {
      setStatus('モニタリング中... 🟢');
    }
    
    // 開発用ログ（必要に応じてコメントアウト解除）
    // console.log("Nose Y:", noseY);
  };

  useEffect(() => {
    // 1. MediaPipe Poseの初期化
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

    // 2. 推論結果が返ってきたときの処理
    pose.onResults((results: Results) => {
      // (A) キャンバスへの描画（映像と骨格）
      if (canvasRef.current && videoRef.current) {
        const canvasCtx = canvasRef.current.getContext('2d');
        if (canvasCtx) {
          canvasCtx.save();
          canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          
          // カメラ映像を描画
          canvasCtx.drawImage(
            results.image, 0, 0, canvasRef.current.width, canvasRef.current.height
          );

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

            // (B) ローカルでのデータ解析処理を実行
            analyzePose(results.poseLandmarks);
          }
          canvasCtx.restore();
        }
      }
    });

    // 3. カメラのセットアップと開始
    if (videoRef.current) {
      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (videoRef.current) {
            await pose.send({ image: videoRef.current });
          }
        },
        width: 1280,
        height: 720,
      });
      camera.start();
    }
  }, []);

  return (
    <div style={{ textAlign: 'center', padding: '20px' }}>
      <h1>高齢者見守りシステム (ローカル版)</h1>
      
      {/* 判定結果の表示エリア */}
      <div style={{ 
        fontSize: '24px', 
        fontWeight: 'bold', 
        margin: '20px 0',
        color: status.includes('⚠️') ? 'red' : 'green' 
      }}>
        現在の状態: {status}
      </div>

      <div style={{ position: 'relative', display: 'inline-block' }}>
        {/* MediaPipeの入力用ビデオ（非表示） */}
        <video
          ref={videoRef}
          style={{ display: 'none' }}
          autoPlay
          playsInline
        ></video>

        {/* 結果描画用キャンバス */}
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