import React, { useEffect, useRef, useState } from 'react';
import * as tmPose from '@teachablemachine/pose';
import emailjs from '@emailjs/browser';

// ==============================================================================
// ★設定エリア：ここを必ず書き換えてください！
// ==============================================================================
const SERVICE_ID = "service_n47ntzj";
const TEMPLATE_ID = "template_xghdcus";
const PUBLIC_KEY = "_46k8h5ZReUK5kurp";   

// ==============================================================================
// その他の設定
// ==============================================================================
const COOLDOWN_TIME = 600000; // 1分間は再送しない (テスト用)
const CAMERA_WIDTH = 400;
const CAMERA_HEIGHT = 400;

const App = () => {
  // ----------------------------------------------------------------------------
  // ステート管理
  // ----------------------------------------------------------------------------
  const [targetEmail, setTargetEmail] = useState(() => localStorage.getItem('targetEmail') || '');
  const [isSettingsMode, setIsSettingsMode] = useState(!localStorage.getItem('targetEmail'));
  
  const [status, setStatus] = useState("システム起動中... ⏳");
  const [currentClass, setCurrentClass] = useState("---"); 
  const [probability, setProbability] = useState(0);       
  const [isAlert, setIsAlert] = useState(false);           

  // 内部変数
  const webcamRef = useRef<tmPose.Webcam | null>(null);
  const modelRef = useRef<tmPose.CustomPoseNet | null>(null);
  const requestRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // ★重要: 送信時間の管理 (localStorageと同期)
  const lastSentTimeRef = useRef(parseInt(localStorage.getItem('lastSentTime') || '0', 10));

  const [inputEmail, setInputEmail] = useState(targetEmail);

  // ----------------------------------------------------------------------------
  // 初期化処理
  // ----------------------------------------------------------------------------
  useEffect(() => {
    if (isSettingsMode) return;

    let isMounted = true;

    const init = async () => {
      try {
        const modelURL = "./my-pose-model/model.json";
        const metadataURL = "./my-pose-model/metadata.json";

        const model = await tmPose.load(modelURL, metadataURL);
        if (!isMounted) return;
        modelRef.current = model;
        
        setStatus("カメラ起動中...");

        const flip = true; 
        const webcam = new tmPose.Webcam(CAMERA_WIDTH, CAMERA_HEIGHT, flip);
        await webcam.setup(); 
        
        if (!isMounted) return;
        await webcam.play();
        webcamRef.current = webcam;

        if (containerRef.current) {
            containerRef.current.innerHTML = '';
            const canvas = webcam.canvas;
            canvas.style.width = "100%";
            canvas.style.height = "100%";
            canvas.style.objectFit = "cover";
            containerRef.current.appendChild(canvas);
        }

        setStatus("監視中 🟢");
        requestRef.current = window.requestAnimationFrame(loop);

      } catch (error) {
        console.error(error);
        if (isMounted) setStatus("❌ エラー: カメラ等の読み込み失敗");
      }
    };

    init();

    return () => {
      isMounted = false;
      if (requestRef.current) window.cancelAnimationFrame(requestRef.current);
      if (webcamRef.current) webcamRef.current.stop();
    };
  }, [isSettingsMode]);

  // ----------------------------------------------------------------------------
  // ループ & 推論
  // ----------------------------------------------------------------------------
  const loop = async () => {
    if (!webcamRef.current || !modelRef.current || isSettingsMode) return;
    webcamRef.current.update();
    await predict();
    requestRef.current = window.requestAnimationFrame(loop);
  };

  const predict = async () => {
    if (!webcamRef.current || !modelRef.current) return;
    
    const { posenetOutput } = await modelRef.current.estimatePose(webcamRef.current.canvas);
    const prediction = await modelRef.current.predict(posenetOutput);

    let highestProb = 0;
    let bestClassName = "";
    
    for (let i = 0; i < prediction.length; i++) {
      if (prediction[i].probability > highestProb) {
        highestProb = prediction[i].probability;
        bestClassName = prediction[i].className;
      }
    }

    setCurrentClass(bestClassName);
    const probPercent = Math.round(highestProb * 100);
    setProbability(probPercent);

    if (bestClassName === "Fall" || bestClassName === "転倒" || bestClassName === "倒れている") {
      setIsAlert(true);
      checkAndSendEmail(probPercent);
    } else {
      setIsAlert(false);
    }
  };

  // ----------------------------------------------------------------------------
  // メール送信機能 (デバッグ強化版)
  // ----------------------------------------------------------------------------
  const checkAndSendEmail = (confidence: number) => {
    const now = Date.now();
    
    // ★改良: ループ内では localStorage から直接メールアドレスを読み取る (確実性アップ)
    const currentEmail = localStorage.getItem('targetEmail');

    // 1. 確信度が低いなら無視
    if (confidence <= 90) return;

    // 2. メールアドレス未設定ならログを出して終了
    if (!currentEmail) {
      console.warn("⚠️ メールアドレスが設定されていません");
      return;
    }

    // 3. クールダウン時間のチェック
    if (now - lastSentTimeRef.current <= COOLDOWN_TIME) {
      // 頻繁に出すぎると見づらいのでログは出さないか、必要なら以下をコメントアウト解除
      // console.log(`⏳ クールダウン中... あと ${Math.round((COOLDOWN_TIME - (now - lastSentTimeRef.current))/1000)} 秒`);
      return;
    }
      
    // --- ここから送信処理 ---
    console.log(`📩 送信条件クリア！ ${currentEmail} に送信を試みます...`);

    // 即座にロック
    lastSentTimeRef.current = now;
    localStorage.setItem('lastSentTime', now.toString());

    const templateParams = {
      to_name: "保護者様",
      user_email: currentEmail, // テンプレート側を {{user_email}} に変更している必要があります
      probability: confidence,
      time: new Date().toLocaleTimeString(),
    };

    emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, PUBLIC_KEY)
      .then((response) => {
          console.log('✅ 送信成功!', response.status, response.text);
          setStatus("📩 メール通知を送信しました！");
          setTimeout(() => setStatus("監視中 🟢"), 3000);
      }, (err) => {
          console.error('❌ 送信失敗:', err);
          if (err.status === 429) setStatus("⚠️ 送信制限中 (しばらくお待ちください)");
          else setStatus("❌ 送信エラー: ID設定などを確認してください");
      });
  };

  const handleSaveSettings = () => {
    if (!inputEmail.includes("@")) {
      alert("正しいメールアドレスを入力してください");
      return;
    }
    setTargetEmail(inputEmail);
    localStorage.setItem('targetEmail', inputEmail);
    setIsSettingsMode(false);
    setStatus("設定を保存しました。カメラを起動します...");
  };

  // ----------------------------------------------------------------------------
  // UI 描画
  // ----------------------------------------------------------------------------
  if (isSettingsMode) {
    return (
      <div style={{ 
        width: '100vw', height: '100vh', backgroundColor: '#f0f2f5',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
        fontFamily: 'Arial, sans-serif'
      }}>
        <div style={{ 
          padding: '30px', backgroundColor: 'white', borderRadius: '15px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.1)', width: '90%', maxWidth: '400px', textAlign: 'center'
        }}>
          <h2>📧 初期設定</h2>
          <p style={{ color: '#666', marginBottom: '20px' }}>緊急時の通知先メールアドレスを<br/>入力してください。</p>
          <input 
            type="email" placeholder="example@gmail.com" value={inputEmail}
            onChange={(e) => setInputEmail(e.target.value)}
            style={{ 
              width: '100%', padding: '12px', fontSize: '16px', borderRadius: '8px',
              border: '1px solid #ccc', marginBottom: '20px', boxSizing: 'border-box'
            }}
          />
          <button onClick={handleSaveSettings} style={{ 
            width: '100%', padding: '12px', fontSize: '16px', fontWeight: 'bold',
            backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer'
          }}>設定を保存して開始</button>
          {targetEmail && (
            <button onClick={() => setIsSettingsMode(false)} style={{ 
              marginTop: '10px', background: 'none', border: 'none', color: '#666', cursor: 'pointer', textDecoration: 'underline'
            }}>キャンセル</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#000', fontFamily: 'Arial, sans-serif' }}>
      <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }}></div>
      
      <button onClick={() => setIsSettingsMode(true)} style={{
        position: 'absolute', top: '15px', right: '15px', zIndex: 20,
        backgroundColor: 'rgba(0,0,0,0.5)', color: 'white', border: 'none',
        padding: '8px 12px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px'
      }}>⚙️ 設定変更</button>

      <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '400px', zIndex: 10, textAlign: 'center' }}>
        <div style={{ 
          padding: '15px 20px',
          backgroundColor: isAlert ? 'rgba(255, 235, 238, 0.9)' : 'rgba(255, 255, 255, 0.85)',
          border: `4px solid ${isAlert ? '#f44336' : '#4caf50'}`,
          borderRadius: '20px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          backdropFilter: 'blur(5px)',
          transition: 'all 0.3s ease'
        }}>
          <h2 style={{ margin: '0', fontSize: '1.5rem', color: '#333' }}>
            状態: <span style={{ color: isAlert ? '#d32f2f' : '#2e7d32', fontWeight: 'bold' }}>{currentClass}</span>
          </h2>
          <div style={{ marginTop: '5px', fontSize: '1rem', color: '#555' }}>
            確信度: <strong>{probability}%</strong>
          </div>
          {isAlert && (
            <div style={{ marginTop: '10px', color: '#d32f2f', fontWeight: 'bold', fontSize: '1.1rem', animation: 'blink 0.5s infinite' }}>
              ⚠️ 転倒検知！<br/>保護者に通知します
            </div>
          )}
        </div>
        <div style={{ marginTop: '10px', color: 'rgba(255,255,255,0.8)', textShadow: '0 1px 2px rgba(0,0,0,0.8)', fontSize: '0.8rem' }}>{status}</div>
      </div>
      <style>{`@keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }`}</style>
    </div>
  );
};

export default App;