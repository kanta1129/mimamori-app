import { useEffect, useRef, useState } from 'react';
import * as tmPose from '@teachablemachine/pose';
import emailjs from '@emailjs/browser';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, serverTimestamp } from "firebase/database";

// ==============================================================================
// ★設定エリア 1: Firebase Config (.envから読み込み)
// ==============================================================================
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DB_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// ==============================================================================
// ★設定エリア 2: EmailJS Config (.envから読み込み)
// ==============================================================================
const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

// ==============================================================================
// ==============================================================================
// ★設定エリア 3: システム共通設定
// ==============================================================================
// 家族ID（合言葉）：これが一致するデバイス同士がグループになります
const FAMILY_ID = "fujii_family"; 

const CAMERA_WIDTH = 400;
const CAMERA_HEIGHT = 400;

// ==============================================================================

// Firebase初期化
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// デバイスID生成 (ブラウザごとに固定のIDを作る)
const getDeviceId = () => {
  let id = localStorage.getItem('deviceId');
  if (!id) {
    id = 'cam_' + Math.random().toString(36).substr(2, 5);
    localStorage.setItem('deviceId', id);
  }
  return id;
};

const App = () => {
  const [mode, setMode] = useState<'select' | 'camera' | 'monitor'>('select');
  
  // モード選択画面
  if (mode === 'select') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', gap: '20px', fontFamily: 'Arial' }}>
        <h1>システム選択</h1>
        <p>Family ID: <b>{FAMILY_ID}</b></p>
        <button onClick={() => setMode('camera')} style={btnStyle}>📷 見守りカメラとして起動</button>
        <button onClick={() => setMode('monitor')} style={btnStyle}>💻 管理モニターとして起動</button>
      </div>
    );
  }

  return mode === 'camera' ? <CameraMode /> : <MonitorMode />;
};

// ==============================================================================
// 【1】カメラモード (転倒検知して 家族ID の箱の中に書き込む)
// ==============================================================================
const CameraMode = () => {
  const deviceId = getDeviceId();
  const [statusText, setStatusText] = useState("起動中...");
  const [isAlert, setIsAlert] = useState(false);
  
  const webcamRef = useRef<tmPose.Webcam | null>(null);
  const modelRef = useRef<tmPose.CustomPoseNet | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastStateRef = useRef(""); 

  useEffect(() => {
    const init = async () => {
      const modelURL = "./my-pose-model/model.json";
      const metadataURL = "./my-pose-model/metadata.json";
      modelRef.current = await tmPose.load(modelURL, metadataURL);

      const webcam = new tmPose.Webcam(CAMERA_WIDTH, CAMERA_HEIGHT, true);
      await webcam.setup();
      await webcam.play();
      webcamRef.current = webcam;

      if (containerRef.current) {
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(webcam.canvas);
        const canvas = webcam.canvas;
        canvas.style.width = "100%"; canvas.style.height = "100%"; canvas.style.objectFit = "cover";
      }

      setStatusText(`ID: ${deviceId} で監視中 🟢`);
      window.requestAnimationFrame(loop);
    };
    init();
  }, []);

  const loop = async () => {
    if (webcamRef.current && modelRef.current) {
      webcamRef.current.update();
      await predict();
      window.requestAnimationFrame(loop);
    }
  };

  const predict = async () => {
    if (!webcamRef.current || !modelRef.current) return;
    const { posenetOutput } = await modelRef.current.estimatePose(webcamRef.current.canvas);
    const prediction = await modelRef.current.predict(posenetOutput);

    const best = prediction.reduce((prev, current) => (prev.probability > current.probability) ? prev : current);
    const isFall = (best.className === "Fall" || best.className === "転倒" || best.className === "倒れている") && best.probability > 0.9;
    
    setIsAlert(isFall);

    const currentState = isFall ? "FALL" : "SAFE";
    
    if (lastStateRef.current !== currentState) {
        // ★修正ポイント：families/家族ID/デバイスID に書き込む
        set(ref(db, `families/${FAMILY_ID}/${deviceId}`), {
            status: currentState,
            probability: Math.round(best.probability * 100),
            lastUpdate: serverTimestamp()
        });
        lastStateRef.current = currentState;
    }
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', backgroundColor: '#000', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div style={{ 
        position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
        padding: '15px', background: isAlert ? 'rgba(255,0,0,0.8)' : 'rgba(255,255,255,0.8)',
        borderRadius: '10px', textAlign: 'center', color: isAlert ? '#fff' : '#000', fontWeight: 'bold'
      }}>
        {isAlert ? "⚠️ 転倒検知！データを送信中" : statusText}
      </div>
    </div>
  );
};

// ==============================================================================
// 【2】監視モニターモード (自分の 家族ID のデータだけを見る)
// ==============================================================================
const MonitorMode = () => {
  const [cameras, setCameras] = useState<any>({});
  const [log, setLog] = useState<string[]>([]);
  const lastSentTimeRef = useRef(0);
  
  const [targetEmail, setTargetEmail] = useState(() => localStorage.getItem('targetEmail') || '');
  const [emailInput, setEmailInput] = useState(targetEmail);

  useEffect(() => {
    // ★修正ポイント：families/家族ID を監視する
    const camerasRef = ref(db, `families/${FAMILY_ID}`);
    
    const unsubscribe = onValue(camerasRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setCameras(data);
        checkAlert(data);
      } else {
        setCameras({}); // データがない場合
      }
    });

    return () => unsubscribe();
  }, [targetEmail]);

  const checkAlert = (data: any) => {
    const now = Date.now();
    let anyFall = false;
    let fallDevice = "";

    Object.keys(data).forEach(key => {
      if (data[key].status === "FALL") {
        anyFall = true;
        fallDevice = key;
      }
    });

    if (anyFall && targetEmail && (now - lastSentTimeRef.current > 60000)) {
      sendEmail(fallDevice);
      lastSentTimeRef.current = now;
    }
  };

  const sendEmail = (deviceId: string) => {
    const msg = `🚨 警告: カメラ[${deviceId}]で転倒を検知しました！`;
    setLog(prev => [new Date().toLocaleTimeString() + " " + msg, ...prev]);

    const templateParams = {
        to_name: "管理者様",
        user_email: targetEmail,
        probability: "100", 
        time: new Date().toLocaleTimeString() + ` (Device: ${deviceId})`
    };

    emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, PUBLIC_KEY)
      .then(() => console.log("Sent"))
      .catch(err => console.error(err));
  };

  const saveEmail = () => {
      localStorage.setItem('targetEmail', emailInput);
      setTargetEmail(emailInput);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial', maxWidth: '800px', margin: '0 auto' }}>
      <h1>💻 統合監視モニター (Level 2)</h1>
      <p>Family Group: <b>{FAMILY_ID}</b></p>
      
      <div style={{ marginBottom: '20px', padding: '15px', background: '#f0f0f0', borderRadius: '8px' }}>
        <h3>通知先設定</h3>
        <input 
            type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} 
            placeholder="メールアドレス" style={{ padding: '8px', width: '250px' }}
        />
        <button onClick={saveEmail} style={{ marginLeft: '10px', padding: '8px' }}>保存</button>
        <div>現在の設定: <b>{targetEmail || "未設定"}</b></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '15px' }}>
        {Object.keys(cameras).length === 0 && <p>カメラ接続待ち... スマホでアクセスしてください</p>}
        
        {Object.keys(cameras).map(key => {
            const cam = cameras[key];
            const isFall = cam.status === "FALL";
            return (
                <div key={key} style={{ 
                    padding: '20px', borderRadius: '10px', color: '#fff',
                    background: isFall ? '#ff4444' : '#44cc44',
                    textAlign: 'center', boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
                }}>
                    <div style={{ fontWeight: 'bold' }}>{key}</div>
                    <div style={{ fontSize: '1.5em', margin: '10px 0' }}>{cam.status}</div>
                    <div style={{ fontSize: '0.8em' }}>確信度: {cam.probability}%</div>
                </div>
            )
        })}
      </div>

      <div style={{ marginTop: '30px', borderTop: '1px solid #ccc', paddingTop: '10px' }}>
        <h3>システムログ</h3>
        <ul style={{ color: '#666', fontSize: '0.9em' }}>
            {log.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      </div>
    </div>
  );
};

const btnStyle = {
    padding: '20px 40px', fontSize: '1.2em', cursor: 'pointer',
    backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '8px'
};

export default App;