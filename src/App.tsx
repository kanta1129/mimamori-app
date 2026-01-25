import React, { useEffect, useRef, useState } from 'react';
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

// ランダムな家族IDを生成
const generateFamilyId = () => {
  return 'fam_' + Math.random().toString(36).substr(2, 6);
};

// メインコンポーネント
const App = () => {
  // 状態管理: 'setup', 'select', 'camera', 'monitor'
  const [mode, setMode] = useState<'setup' | 'select' | 'camera' | 'monitor'>(() => {
    return localStorage.getItem('familyId') ? 'select' : 'setup';
  });
  
  const [familyId, setFamilyId] = useState(() => localStorage.getItem('familyId') || '');
  const [tempInputId, setTempInputId] = useState('');
  const [isInputMode, setIsInputMode] = useState(false);

  // IDを保存して次へ
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
        <h1 style={{color: '#333', margin: '0 0 20px 0'}}>見守りシステムへようこそ</h1>
        
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
            <p style={{textAlign: 'center', margin: 0}}>共有されたIDを入力してください</p>
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
        
        <div style={{padding: '20px', background: 'white', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', marginBottom: '20px', textAlign: 'center', width: '80%', maxWidth: '300px'}}>
          <p style={{margin: '0', fontSize: '0.9em', color: '#666'}}>あなたのグループID</p>
          <p style={{margin: '5px 0 0', fontSize: '1.8em', fontWeight: 'bold', color: '#007bff', fontFamily: 'monospace'}}>{familyId}</p>
          <button 
            onClick={() => { localStorage.removeItem('familyId'); setMode('setup'); setIsInputMode(false); }}
            style={{marginTop: '15px', fontSize: '0.8em', background: 'none', border: 'none', color: '#999', cursor: 'pointer', textDecoration: 'underline'}}>
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

  // 3. 各機能モード (戻るボタン用の関数 onBack を渡す) ==========================
  return mode === 'camera' 
    ? <CameraMode familyId={familyId} onBack={() => setMode('select')} /> 
    : <MonitorMode familyId={familyId} onBack={() => setMode('select')} />;
};

// ==============================================================================
// 【カメラモード】
// ==============================================================================
const CameraMode = ({ familyId, onBack }: { familyId: string, onBack: () => void }) => {
  const deviceId = getDeviceId();
  const [statusText, setStatusText] = useState("起動中...");
  const [isAlert, setIsAlert] = useState(false);
  
  const webcamRef = useRef<tmPose.Webcam | null>(null);
  const modelRef = useRef<tmPose.CustomPoseNet | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastStateRef = useRef(""); 
  const loopRef = useRef<number>(0);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        const modelURL = "./my-pose-model/model.json";
        const metadataURL = "./my-pose-model/metadata.json";
        modelRef.current = await tmPose.load(modelURL, metadataURL);

        const webcam = new tmPose.Webcam(CAMERA_WIDTH, CAMERA_HEIGHT, true);
        await webcam.setup();
        
        if (isMounted) {
            await webcam.play();
            webcamRef.current = webcam;

            if (containerRef.current) {
                containerRef.current.innerHTML = '';
                containerRef.current.appendChild(webcam.canvas);
                const canvas = webcam.canvas;
                canvas.style.width = "100%"; canvas.style.height = "100%"; canvas.style.objectFit = "cover";
            }

            setStatusText(`Group: ${familyId}\nID: ${deviceId}`);
            loop(); 
        }
      } catch (e) {
        if (isMounted) setStatusText("カメラ起動エラー: 許可を確認してください");
      }
    };
    init();

    return () => {
        isMounted = false;
        if (loopRef.current) cancelAnimationFrame(loopRef.current);
        if (webcamRef.current) {
             webcamRef.current.stop();
        }
    };
  }, []);

  const loop = async () => {
    if (webcamRef.current && modelRef.current && webcamRef.current.canvas) {
      webcamRef.current.update();
      await predict();
      loopRef.current = requestAnimationFrame(loop);
    }
  };

  const predict = async () => {
    if (!webcamRef.current || !modelRef.current || !webcamRef.current.canvas) return;
    const { posenetOutput } = await modelRef.current.estimatePose(webcamRef.current.canvas);
    const prediction = await modelRef.current.predict(posenetOutput);

    const best = prediction.reduce((prev, current) => (prev.probability > current.probability) ? prev : current);
    const isFall = (best.className === "Fall" || best.className === "転倒" || best.className === "倒れている") && best.probability > 0.9;
    
    setIsAlert(isFall);

    const currentState = isFall ? "FALL" : "SAFE";
    
    if (lastStateRef.current !== currentState) {
        set(ref(db, `families/${familyId}/${deviceId}`), {
            status: currentState,
            probability: Math.round(best.probability * 100),
            lastUpdate: serverTimestamp()
        });
        lastStateRef.current = currentState;
    }
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', backgroundColor: '#000', overflow: 'hidden' }}>
      {/* 戻るボタン */}
      <button onClick={onBack} style={{
          position: 'absolute', top: 20, left: 20, zIndex: 100,
          background: 'rgba(0,0,0,0.6)', color: 'white', border: '1px solid rgba(255,255,255,0.5)', 
          borderRadius: '30px', padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9em'
      }}>
          ⬅ もどる
      </button>

      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div style={{ 
        position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)', width: '80%',
        padding: '15px', background: isAlert ? 'rgba(255,0,0,0.8)' : 'rgba(255,255,255,0.9)',
        borderRadius: '15px', textAlign: 'center', color: isAlert ? '#fff' : '#000', fontWeight: 'bold',
        whiteSpace: 'pre-wrap', boxShadow: '0 4px 15px rgba(0,0,0,0.3)', fontSize: '1.1em'
      }}>
        {isAlert ? "⚠️ 転倒検知！データを送信中" : statusText}
      </div>
    </div>
  );
};

// ==============================================================================
// 【モニターモード】(画面幅拡大 & 設定クラウド同期版)
// ==============================================================================
const MonitorMode = ({ familyId, onBack }: { familyId: string, onBack: () => void }) => {
  const [cameras, setCameras] = useState<any>({});
  const [log, setLog] = useState<string[]>([]);
  const lastSentTimeRef = useRef(0);
  
  // メール設定 (初期値は空)
  const [targetEmail, setTargetEmail] = useState('');
  const [emailInput, setEmailInput] = useState('');

  useEffect(() => {
    // 家族のデータ全体を監視 (カメラも設定も含む)
    const familyRef = ref(db, `families/${familyId}`);
    
    const unsubscribe = onValue(familyRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // 1. 設定データを取り出す
        if (data.settings && data.settings.email) {
            setTargetEmail(data.settings.email);
            // 入力欄も同期 (編集中でなければ)
            if (document.activeElement?.tagName !== "INPUT") {
                setEmailInput(data.settings.email);
            }
        }

        // 2. カメラデータを取り出す (settings以外)
        const cameraData: any = {};
        Object.keys(data).forEach(key => {
            if (key !== 'settings') {
                cameraData[key] = data[key];
            }
        });

        setCameras(cameraData);
        checkAlert(cameraData, data.settings?.email);
      } else {
        setCameras({});
      }
    });

    return () => unsubscribe();
  }, [familyId]);

  const checkAlert = (cameraData: any, currentEmail: string) => {
    const now = Date.now();
    let anyFall = false;
    let fallDevice = "";

    Object.keys(cameraData).forEach(key => {
      if (cameraData[key].status === "FALL") {
        anyFall = true;
        fallDevice = key;
      }
    });

    // DBから取得した最新のメールアドレスを使用
    if (anyFall && currentEmail && (now - lastSentTimeRef.current > 60000)) {
      sendEmail(fallDevice, currentEmail);
      lastSentTimeRef.current = now;
    }
  };

  const sendEmail = (deviceId: string, toEmail: string) => {
    const msg = `🚨 警告: カメラ[${deviceId}]で転倒を検知しました！`;
    setLog(prev => [new Date().toLocaleTimeString() + " " + msg, ...prev]);

    const templateParams = {
        to_name: "管理者様",
        user_email: toEmail, // 同期されたメアドに送信
        probability: "100", 
        time: new Date().toLocaleTimeString() + ` (Device: ${deviceId})`
    };

    emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, PUBLIC_KEY)
      .then(() => console.log("Sent"))
      .catch(err => console.error(err));
  };

  // クラウド(Firebase)に設定を保存する
  const saveEmail = () => {
      set(ref(db, `families/${familyId}/settings`), {
          email: emailInput
      });
      setTargetEmail(emailInput);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial', maxWidth: '1200px', margin: '0 auto', width: '95%', boxSizing: 'border-box' }}>
      
      {/* ヘッダーエリア */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
          <button onClick={onBack} style={{
              background: 'white', border: '1px solid #ccc', borderRadius: '5px', 
              padding: '8px 15px', cursor: 'pointer', marginRight: '15px', fontWeight: 'bold', color: '#555'
          }}>⬅ もどる</button>
          <h1 style={{ margin: 0, fontSize: '1.4em', color: '#333' }}>💻 統合監視モニター</h1>
      </div>

      <div style={{ marginBottom: '20px', padding: '10px', background: '#e8f0fe', borderRadius: '5px', color: '#0d47a1', fontSize: '0.9em'}}>
        現在監視中のグループID: <strong style={{fontSize: '1.2em', marginLeft: '5px'}}>{familyId}</strong>
      </div>
      
      {/* メール設定エリア (クラウド同期) */}
      <div style={{ marginBottom: '20px', padding: '20px', background: '#fff', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <h3 style={{marginTop: 0, fontSize: '1.1em', color: '#444'}}>📩 通知先設定 (グループ共有)</h3>
        <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
            <input 
                type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} 
                placeholder="メールアドレスを入力" style={inputStyle}
            />
            <button onClick={saveEmail} style={{ padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                共有設定を保存
            </button>
        </div>
        <div style={{marginTop: '10px', fontSize: '0.9em', color: '#666'}}>
            現在の設定: <b>{targetEmail || "（未設定 - 保存すると全員に反映されます）"}</b>
        </div>
      </div>

      {/* カメラ一覧グリッド */}
      <h3 style={{fontSize: '1.1em', color: '#444'}}>📷 接続中のカメラ</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
        {Object.keys(cameras).length === 0 && (
            <div style={{padding: '30px', background: '#f9f9f9', borderRadius: '10px', textAlign: 'center', color: '#888', gridColumn: '1 / -1'}}>
                カメラがまだ接続されていません。<br/>スマホで同じIDを入力して起動してください。
            </div>
        )}
        
        {Object.keys(cameras).map(key => {
            const cam = cameras[key];
            const isFall = cam.status === "FALL";
            return (
                <div key={key} style={{ 
                    padding: '20px', borderRadius: '12px', color: '#fff',
                    background: isFall ? '#dc3545' : '#28a745',
                    textAlign: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                    transition: 'all 0.3s ease'
                }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '5px', fontSize: '0.9em', opacity: 0.9 }}>{key}</div>
                    <div style={{ fontSize: '1.8em', margin: '10px 0', fontWeight: 'bold' }}>{cam.status}</div>
                    <div style={{ fontSize: '0.8em', opacity: 0.9 }}>確信度: {cam.probability}%</div>
                </div>
            )
        })}
      </div>

      {/* ログエリア */}
      <div style={{ marginTop: '30px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
        <h3 style={{fontSize: '1.1em', color: '#444'}}>📝 システムログ</h3>
        <ul style={{ color: '#666', fontSize: '0.85em', paddingLeft: '20px', lineHeight: '1.6' }}>
            {log.length === 0 && <li>ログはまだありません</li>}
            {log.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      </div>
    </div>
  );
};

// スタイル定義
const containerStyle = {
  display: 'flex' as const, 
  flexDirection: 'column' as const, 
  height: '100vh', 
  width: '100vw',
  justifyContent: 'center', 
  alignItems: 'center', 
  gap: '20px', 
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', 
  backgroundColor: '#f5f7fa', 
  margin: 0, 
  padding: 0
};

const btnStyle = {
  padding: '15px 20px', 
  fontSize: '1.1em', 
  cursor: 'pointer',
  color: 'white', 
  border: 'none', 
  borderRadius: '12px', 
  fontWeight: 'bold', 
  width: '100%',
  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
  transition: 'transform 0.1s ease'
};

const inputStyle = {
  padding: '12px', 
  fontSize: '1em', 
  borderRadius: '8px', 
  border: '1px solid #ccc', 
  width: '100%', 
  boxSizing: 'border-box' as const,
  flex: 1
};

export default App;