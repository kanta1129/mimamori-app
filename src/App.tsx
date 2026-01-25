import { useEffect, useRef, useState } from 'react';
import * as tmPose from '@teachablemachine/pose';
import emailjs from '@emailjs/browser';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, serverTimestamp } from "firebase/database";

// ==============================================================================
// 設定エリア (.envから読み込み)
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

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

// ==============================================================================

// Firebase初期化
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const CAMERA_WIDTH = 400;
const CAMERA_HEIGHT = 400;

// デバイスID生成
const getDeviceId = () => {
  let id = localStorage.getItem('deviceId');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substr(2, 5);
    localStorage.setItem('deviceId', id);
  }
  return id;
};

// ランダムな家族IDを生成する関数
const generateFamilyId = () => {
  return 'fam_' + Math.random().toString(36).substr(2, 6);
};

const App = () => {
  // 状態管理: 'setup' (初回設定), 'select' (モード選択), 'camera', 'monitor'
  const [mode, setMode] = useState<'setup' | 'select' | 'camera' | 'monitor'>(() => {
    // IDが保存されていれば 'select' から開始、なければ 'setup' から開始
    return localStorage.getItem('familyId') ? 'select' : 'setup';
  });
  
  const [familyId, setFamilyId] = useState(() => localStorage.getItem('familyId') || '');
  const [tempInputId, setTempInputId] = useState(''); // 入力用の一時変数
  const [isInputMode, setIsInputMode] = useState(false); // 手動入力画面かどうか

  // IDを保存して次へ進む
  const saveAndProceed = (id: string) => {
    if (!id) return;
    setFamilyId(id);
    localStorage.setItem('familyId', id);
    setMode('select');
  };

  // 1. 初回セットアップ画面 ====================================================
  if (mode === 'setup') {
    return (
      <div style={containerStyle}>
        <h1 style={{color: '#333'}}>見守りシステムへようこそ</h1>
        
        {!isInputMode ? (
          <div style={{display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '300px'}}>
            <button 
              onClick={() => saveAndProceed(generateFamilyId())} 
              style={{...btnStyle, background: '#007bff'}}>
              🆕 新しいグループを作成
            </button>
            <button 
              onClick={() => setIsInputMode(true)} 
              style={{...btnStyle, background: 'white', color: '#555', border: '1px solid #ccc'}}>
              🔑 既存のグループに参加
            </button>
          </div>
        ) : (
          <div style={{display: 'flex', flexDirection: 'column', gap: '15px', width: '100%', maxWidth: '300px'}}>
            <p>共有されたIDを入力してください</p>
            <input 
              type="text" 
              placeholder="例: fam_xyz123"
              value={tempInputId} 
              onChange={(e) => setTempInputId(e.target.value)}
              style={inputStyle}
            />
            <button 
              onClick={() => saveAndProceed(tempInputId)} 
              style={{...btnStyle, background: '#28a745'}}>
              決定して次へ
            </button>
            <button 
              onClick={() => setIsInputMode(false)} 
              style={{background: 'none', border: 'none', color: '#666', cursor: 'pointer', textDecoration: 'underline'}}>
              戻る
            </button>
          </div>
        )}
      </div>
    );
  }

  // 2. モード選択画面 ==========================================================
  if (mode === 'select') {
    return (
      <div style={containerStyle}>
        <h1 style={{color: '#333'}}>システム選択</h1>
        
        <div style={{padding: '15px', background: 'white', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', marginBottom: '20px', textAlign: 'center'}}>
          <p style={{margin: '0', fontSize: '0.9em', color: '#666'}}>あなたのグループID</p>
          <p style={{margin: '5px 0 0', fontSize: '1.5em', fontWeight: 'bold', color: '#007bff', fontFamily: 'monospace'}}>{familyId}</p>
          <button 
            onClick={() => { localStorage.removeItem('familyId'); setMode('setup'); setIsInputMode(false); }}
            style={{marginTop: '10px', fontSize: '0.8em', background: 'none', border: 'none', color: '#999', cursor: 'pointer', textDecoration: 'underline'}}>
            IDを変更・リセット
          </button>
        </div>

        <div style={{display: 'flex', flexDirection: 'column', gap: '15px', width: '100%', maxWidth: '300px'}}>
          <button onClick={() => setMode('camera')} style={{...btnStyle, background: '#007bff'}}>📷 カメラとして起動</button>
          <button onClick={() => setMode('monitor')} style={{...btnStyle, background: '#28a745'}}>💻 モニターとして起動</button>
        </div>
      </div>
    );
  }

  // 3. 各機能モードへ ==========================================================
  return mode === 'camera' ? <CameraMode familyId={familyId} /> : <MonitorMode familyId={familyId} />;
};

// ==============================================================================
// 【カメラモード】 & 【モニターモード】 (中身は変更なし、前回のまま)
// ==============================================================================
// ※前回のコードの CameraMode, MonitorMode コンポーネントをそのまま使います。
// ※長くなるので省略していますが、ここには以前の CameraMode と MonitorMode のコードが入ります。
// ※btnStyleなどのスタイル定義も必要です。

const CameraMode = ({ familyId }: { familyId: string }) => {
    // ... (前回の CameraMode の中身をコピペしてください) ...
    // ※省略せずに全て記述する必要がありますが、変更点はありません。
    // 手間を省くため、もし必要なら全文を再掲しますので仰ってください。
    
    // ↓↓↓ 以下はダミーではなく、前回のロジックを入れてください ↓↓↓
    const deviceId = getDeviceId();
    const [statusText, setStatusText] = useState("起動中...");
    const [isAlert, setIsAlert] = useState(false);
    const webcamRef = useRef<tmPose.Webcam | null>(null);
    const modelRef = useRef<tmPose.CustomPoseNet | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const lastStateRef = useRef(""); 

    useEffect(() => {
        const init = async () => {
        try {
            const modelURL = "./my-pose-model/model.json";
            const metadataURL = "./my-pose-model/metadata.json";
            modelRef.current = await tmPose.load(modelURL, metadataURL);
            const webcam = new tmPose.Webcam(CAMERA_WIDTH, CAMERA_HEIGHT, true);
            await webcam.setup(); await webcam.play(); webcamRef.current = webcam;
            if (containerRef.current) {
            containerRef.current.innerHTML = '';
            containerRef.current.appendChild(webcam.canvas);
            const canvas = webcam.canvas;
            canvas.style.width = "100%"; canvas.style.height = "100%"; canvas.style.objectFit = "cover";
            }
            setStatusText(`Group: ${familyId}\nID: ${deviceId}`);
            window.requestAnimationFrame(loop);
        } catch (e) { setStatusText("カメラ起動エラー"); }
        };
        init();
    }, []);

    const loop = async () => {
        if (webcamRef.current && modelRef.current) {
        webcamRef.current.update(); await predict(); window.requestAnimationFrame(loop);
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
            set(ref(db, `families/${familyId}/${deviceId}`), {
                status: currentState, probability: Math.round(best.probability * 100), lastUpdate: serverTimestamp()
            });
            lastStateRef.current = currentState;
        }
    };

    return (
        <div style={{ position: 'relative', width: '100vw', height: '100vh', backgroundColor: '#000', overflow: 'hidden' }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        <div style={{ 
            position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
            padding: '10px 20px', background: isAlert ? 'rgba(255,0,0,0.8)' : 'rgba(255,255,255,0.8)',
            borderRadius: '10px', textAlign: 'center', color: isAlert ? '#fff' : '#000', fontWeight: 'bold',
            whiteSpace: 'pre-wrap', boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
        }}>
            {isAlert ? "⚠️ 転倒検知！データを送信中" : statusText}
        </div>
        </div>
    );
};

const MonitorMode = ({ familyId }: { familyId: string }) => {
    // ... (前回の MonitorMode の中身) ...
    const [cameras, setCameras] = useState<any>({});
    const [log, setLog] = useState<string[]>([]);
    const lastSentTimeRef = useRef(0);
    const [targetEmail, setTargetEmail] = useState(() => localStorage.getItem('targetEmail') || '');
    const [emailInput, setEmailInput] = useState(targetEmail);

    useEffect(() => {
        const camerasRef = ref(db, `families/${familyId}`);
        const unsubscribe = onValue(camerasRef, (snapshot) => {
        const data = snapshot.val();
        if (data) { setCameras(data); checkAlert(data); } else { setCameras({}); }
        });
        return () => unsubscribe();
    }, [familyId, targetEmail]);

    const checkAlert = (data: any) => {
        const now = Date.now();
        let anyFall = false; let fallDevice = "";
        Object.keys(data).forEach(key => { if (data[key].status === "FALL") { anyFall = true; fallDevice = key; } });
        if (anyFall && targetEmail && (now - lastSentTimeRef.current > 60000)) {
        sendEmail(fallDevice); lastSentTimeRef.current = now;
        }
    };

    const sendEmail = (deviceId: string) => {
        const msg = `🚨 警告: カメラ[${deviceId}]で転倒を検知しました！`;
        setLog(prev => [new Date().toLocaleTimeString() + " " + msg, ...prev]);
        const templateParams = { to_name: "管理者様", user_email: targetEmail, probability: "100", time: new Date().toLocaleTimeString() + ` (Device: ${deviceId})` };
        emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, PUBLIC_KEY)
        .then(() => console.log("Sent")).catch(err => console.error(err));
    };

    const saveEmail = () => { localStorage.setItem('targetEmail', emailInput); setTargetEmail(emailInput); };

    return (
        <div style={{ padding: '20px', fontFamily: 'Arial', maxWidth: '800px', margin: '0 auto' }}>
        <h1>💻 統合監視モニター</h1>
        <div style={{ marginBottom: '20px', padding: '10px', background: '#e8f0fe', borderRadius: '5px', color: '#0d47a1'}}>
            現在監視中のグループ: <strong>{familyId}</strong>
        </div>
        <div style={{ marginBottom: '20px', padding: '15px', background: '#f0f0f0', borderRadius: '8px' }}>
            <h3>通知先設定</h3>
            <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder="メールアドレス" style={{ padding: '8px', width: '250px' }} />
            <button onClick={saveEmail} style={{ marginLeft: '10px', padding: '8px' }}>保存</button>
            <div>現在の設定: <b>{targetEmail || "未設定"}</b></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '15px' }}>
            {Object.keys(cameras).length === 0 && <p>カメラ接続待ち... スマホで同じFamily IDを入力してください</p>}
            {Object.keys(cameras).map(key => {
                const cam = cameras[key];
                const isFall = cam.status === "FALL";
                return (
                    <div key={key} style={{ padding: '20px', borderRadius: '10px', color: '#fff', background: isFall ? '#ff4444' : '#44cc44', textAlign: 'center', boxShadow: '0 4px 8px rgba(0,0,0,0.2)' }}>
                        <div style={{ fontWeight: 'bold' }}>{key}</div>
                        <div style={{ fontSize: '1.5em', margin: '10px 0' }}>{cam.status}</div>
                        <div style={{ fontSize: '0.8em' }}>確信度: {cam.probability}%</div>
                    </div>
                )
            })}
        </div>
        <div style={{ marginTop: '30px', borderTop: '1px solid #ccc', paddingTop: '10px' }}>
            <h3>システムログ</h3>
            <ul style={{ color: '#666', fontSize: '0.9em' }}>{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
        </div>
    );
};

// スタイル定義
const containerStyle = {
  display: 'flex' as const, flexDirection: 'column' as const, height: '100vh', 
  justifyContent: 'center', alignItems: 'center', gap: '20px', 
  fontFamily: 'Arial', backgroundColor: '#f5f5f5'
};
const btnStyle = {
  padding: '15px 20px', fontSize: '1.1em', cursor: 'pointer',
  color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', width: '100%'
};
const inputStyle = {
  padding: '12px', fontSize: '1.1em', borderRadius: '8px', border: '1px solid #ccc', width: '100%', boxSizing: 'border-box' as const
};

export default App;