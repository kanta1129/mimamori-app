import { useEffect, useRef, useState } from 'react';
import * as tmPose from '@teachablemachine/pose';
import emailjs from '@emailjs/browser';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, serverTimestamp } from "firebase/database";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ==============================================================================
// 設定エリア
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
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// ==============================================================================

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const CAMERA_WIDTH = 400;
const CAMERA_HEIGHT = 400;

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

const getDeviceId = () => {
  let id = localStorage.getItem('deviceId');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substr(2, 5);
    localStorage.setItem('deviceId', id);
  }
  return id;
};

const generateFamilyId = () => {
  return 'fam_' + Math.random().toString(36).substr(2, 6);
};

const App = () => {
  const [mode, setMode] = useState<'setup' | 'select' | 'camera' | 'monitor'>(() => {
    return localStorage.getItem('familyId') ? 'select' : 'setup';
  });
  
  const [familyId, setFamilyId] = useState(() => localStorage.getItem('familyId') || '');
  const [tempInputId, setTempInputId] = useState('');
  const [isInputMode, setIsInputMode] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newFamilyId, setNewFamilyId] = useState('');
  const [setupEmail, setSetupEmail] = useState('');

  const saveAndProceed = (id: string) => {
    if (!id) return;
    setFamilyId(id);
    localStorage.setItem('familyId', id);
    setMode('select');
  };

  const startCreation = () => {
      const id = generateFamilyId();
      setNewFamilyId(id);
      setIsCreating(true);
  };

  const completeCreation = () => {
      if (!setupEmail) {
          alert("メールアドレスを入力してください．");
          return;
      }
      set(ref(db, `families/${newFamilyId}/settings`), {
          email: setupEmail
      });
      saveAndProceed(newFamilyId);
  };

  if (mode === 'setup') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={{color: '#333', fontSize: '1.5em', marginBottom: '30px'}}>見守りシステムへようこそ</h1>
          {!isInputMode && !isCreating && (
            <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
              <button onClick={startCreation} style={{...btnStyle, background: '#007bff'}}>🆕 新しいグループを作成</button>
              <button onClick={() => setIsInputMode(true)} style={{...btnStyle, background: 'white', color: '#555', border: '1px solid #ccc'}}>🔑 既存のグループに参加</button>
            </div>
          )}
          {isCreating && (
            <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
               <div style={{textAlign: 'center', background: '#f8f9fa', padding: '15px', borderRadius: '10px'}}>
                  <p style={{margin: 0, fontSize: '0.8em', color: '#666'}}>あなたのグループID</p>
                  <p style={{margin: '5px 0', fontSize: '1.4em', fontWeight: 'bold', color: '#007bff'}}>{newFamilyId}</p>
               </div>
               <p style={{margin: '10px 0 0', fontWeight: 'bold', color: '#444', fontSize: '0.9em'}}>管理者メールアドレスの設定</p>
               <input type="email" placeholder="例: parent@example.com" value={setupEmail} onChange={(e) => setSetupEmail(e.target.value)} style={inputStyle} />
               <button onClick={completeCreation} style={{...btnStyle, background: '#007bff'}}>設定して開始</button>
               <button onClick={() => setIsCreating(false)} style={{background: 'none', border: 'none', color: '#666', cursor: 'pointer', textDecoration: 'underline'}}>戻る</button>
            </div>
          )}
          {isInputMode && (
            <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
              <p style={{textAlign: 'center', margin: 0, fontSize: '0.9em'}}>共有されたIDを入力してください．</p>
              <input type="text" placeholder="例: fam_xyz123" value={tempInputId} onChange={(e) => setTempInputId(e.target.value)} style={inputStyle} />
              <button onClick={() => saveAndProceed(tempInputId)} style={{...btnStyle, background: '#28a745'}}>決定して次へ</button>
              <button onClick={() => setIsInputMode(false)} style={{background: 'none', border: 'none', color: '#666', cursor: 'pointer', textDecoration: 'underline'}}>戻る</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (mode === 'select') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={{color: '#333', fontSize: '1.5em', marginBottom: '20px'}}>システム選択</h1>
          <div style={{padding: '15px', background: '#eef2f7', borderRadius: '10px', marginBottom: '20px', textAlign: 'center'}}>
            <p style={{margin: '0', fontSize: '0.8em', color: '#666'}}>現在のグループID</p>
            <p style={{margin: '5px 0 0', fontSize: '1.4em', fontWeight: 'bold', color: '#007bff', fontFamily: 'monospace'}}>{familyId}</p>
          </div>
          <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
            <button onClick={() => setMode('camera')} style={{...btnStyle, background: '#007bff'}}>📷 カメラとして起動</button>
            <button onClick={() => setMode('monitor')} style={{...btnStyle, background: '#28a745'}}>💻 モニターとして起動</button>
            <button onClick={() => { localStorage.removeItem('familyId'); setMode('setup'); }} style={{fontSize: '0.8em', background: 'none', border: 'none', color: '#999', cursor: 'pointer', textDecoration: 'underline'}}>設定をリセット</button>
          </div>
        </div>
      </div>
    );
  }

  return mode === 'camera' 
    ? <CameraMode familyId={familyId} onBack={() => setMode('select')} /> 
    : <MonitorMode familyId={familyId} onBack={() => setMode('select')} />;
};

// ==============================================================================
// 【カメラモード】
// ==============================================================================
const CameraMode = ({ familyId, onBack }: { familyId: string, onBack: () => void }) => {
  const deviceId = getDeviceId();
  const [statusText, setStatusText] = useState("起動中．．．");
  const [isAlert, setIsAlert] = useState(false);
  const [aiState, setAiState] = useState<'idle' | 'asking' | 'listening' | 'judging' | 'cooldown'>('idle');
  const [userReply, setUserReply] = useState("");

  const webcamRef = useRef<tmPose.Webcam | null>(null);
  const modelRef = useRef<tmPose.CustomPoseNet | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const loopRef = useRef<number>(0);
  const cooldownTimerRef = useRef<number>(0);
  const retryCountRef = useRef(0);
  const lastStateRef = useRef(""); 

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || "");

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      try {
        setStatusText("権限を確認中．．．");
        await navigator.mediaDevices.getUserMedia({
            video: { width: CAMERA_WIDTH, height: CAMERA_HEIGHT },
            audio: true
        });

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
                webcam.canvas.style.width = "100%";
                webcam.canvas.style.height = "100%";
                webcam.canvas.style.objectFit = "cover";
                containerRef.current.appendChild(webcam.canvas);
            }
            setStatusText(`監視中: ${familyId}`);
            loop(); 
        }
      } catch (e) {
        if (isMounted) setStatusText("エラー： 許可を確認してください．");
      }
    };
    init();
    return () => {
        isMounted = false;
        if (loopRef.current) cancelAnimationFrame(loopRef.current);
        if (webcamRef.current) webcamRef.current.stop();
        clearTimeout(cooldownTimerRef.current);
    };
  }, []);

  const loop = async () => {
    if (webcamRef.current && modelRef.current && webcamRef.current.canvas) {
      webcamRef.current.update();
      await predict();
      loopRef.current = requestAnimationFrame(loop);
    }
  };

  const speak = (text: string, onEnd?: () => void) => {
      window.speechSynthesis.cancel();
      const msg = new SpeechSynthesisUtterance(text);
      msg.lang = 'ja-JP';
      msg.onend = () => { if(onEnd) onEnd(); };
      window.speechSynthesis.speak(msg);
  };

  const startListening = () => {
    if (!SpeechRecognition) {
        handleNoResponse();
        return;
    }
    setAiState('listening');
    setStatusText("👂 返答を聞いています．．．");
    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.onresult = (event: any) => {
        const reply = event.results[0][0].transcript;
        setUserReply(`「${reply}」`);
        handleUserResponseWithAI(reply);
    };
    recognition.onerror = () => handleNoResponse();
    recognition.start();
  };

  const handleUserResponseWithAI = async (text: string) => {
      setAiState('judging');
      setStatusText("🧠 AIが判断中．．．");
      
      const modelNames = ["gemini-3-flash-preview", "gemini-1.5-flash", "gemini-pro"];
      let success = false;

      for (const mName of modelNames) {
          if (success) break;
          try {
              const model = genAI.getGenerativeModel(
                { model: mName },
                { apiVersion: "v1beta" }
              );
              
              const prompt = `高齢者見守りシステムです．転倒検知後に利用者に「大丈夫ですか？」と聞いたら「${text}」と言われました．
              必ず以下のJSON形式のみで返答してください．
              {"status": "SAFE"|"DANGER"|"UNKNOWN", "reason": "判断の理由", "reply": "利用者にかける返答文"}`;

              const result = await model.generateContent(prompt);
              const response = await result.response;
              const jsonText = response.text().replace(/```json|```/g, "").trim();
              const aiDecision = JSON.parse(jsonText);

              success = true;

              if (aiDecision.status === "SAFE") {
                  speak(aiDecision.reply);
                  enterCooldown("SAFE", aiDecision.reason, aiDecision.reply, text);
              } else if (aiDecision.status === "DANGER") {
                  speak(aiDecision.reply);
                  sendAlertForce(aiDecision.reason, aiDecision.reply, text);
              } else {
                  handleNoResponse();
              }
          } catch (error) {
              console.warn(`Failed with ${mName}`);
          }
      }

      if (!success) {
          fallbackKeywordCheck(text);
      }
  };

  const fallbackKeywordCheck = (text: string) => {
      const safeKeywords = ["筋トレ", "大丈夫", "寝る", "はい", "元気"];
      if (safeKeywords.some(k => text.includes(k))) {
          speak("分かりました．");
          enterCooldown("SAFE", "キーワード一致", "分かりました．", text);
      } else {
          speak("通知を送ります．");
          sendAlertForce("キーワード不一致", "通知を送ります．", text);
      }
  };

  const handleNoResponse = () => {
      if (retryCountRef.current < 1) {
          retryCountRef.current++;
          speak("大丈夫ですか？", () => startListening());
      } else {
          speak("通知を送ります．");
          sendAlertForce("無応答", "通知を送ります．", "（なし）");
      }
  };

  const enterCooldown = (statusStr: string, reason: string, aiReply: string, userSaid: string) => {
      setAiState('cooldown');
      setIsAlert(false);
      set(ref(db, `families/${familyId}/${deviceId}`), {
        status: statusStr, probability: 0, lastUpdate: serverTimestamp(),
        aiReason: reason, aiReply: aiReply, userSaid: userSaid
      });
      cooldownTimerRef.current = window.setTimeout(() => {
          setAiState('idle');
          setUserReply("");
      }, 180000); 
  };

  const sendAlertForce = (reason: string, aiReply: string, userSaid: string) => {
      setAiState('cooldown'); 
      setIsAlert(true);
      set(ref(db, `families/${familyId}/${deviceId}`), {
        status: "FALL", probability: 100, lastUpdate: serverTimestamp(),
        aiReason: reason, aiReply: aiReply, userSaid: userSaid
      });
      cooldownTimerRef.current = window.setTimeout(() => {
          setAiState('idle');
          setIsAlert(false);
          retryCountRef.current = 0;
      }, 60000); 
  };

  const predict = async () => {
    if (aiState !== 'idle' || !webcamRef.current || !modelRef.current) return;
    const { posenetOutput } = await modelRef.current.estimatePose(webcamRef.current.canvas);
    const prediction = await modelRef.current.predict(posenetOutput);
    const best = prediction.reduce((p, c) => (p.probability > c.probability) ? p : c);
    
    if (best.className === "Fall" && best.probability > 0.9) {
        setAiState('asking');
        setStatusText("🗣️ 声かけ中．．．");
        retryCountRef.current = 0;
        speak("転倒を検知しました．大丈夫ですか？", () => startListening());
    } else {
        if (lastStateRef.current !== "SAFE") {
             set(ref(db, `families/${familyId}/${deviceId}`), {
                status: "SAFE", probability: Math.round(best.probability * 100), lastUpdate: serverTimestamp()
            });
            lastStateRef.current = "SAFE";
        }
    }
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', backgroundColor: '#000', overflow: 'hidden' }}>
      <button onClick={onBack} style={backBtnStyle}>⬅ 戻る</button>
      <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }} />
      
      <div style={{ ...overlayContainerStyle, background: aiState === 'cooldown' ? (isAlert ? 'rgba(220, 53, 69, 0.95)' : 'rgba(40, 167, 69, 0.95)') : 'rgba(255,255,255,0.9)' }}>
        <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: aiState === 'cooldown' ? '#fff' : '#333' }}>
          {aiState === 'idle' ? statusText : 
           aiState === 'judging' ? "🧠 AIが状況を判断中．．．" :
           aiState === 'cooldown' ? (isAlert ? "🚨 通知を送信しました" : "✅ 安全を確認しました") : statusText}
        </div>
        {userReply && <div style={{marginTop: '10px', padding: '10px', background: 'rgba(0,0,0,0.05)', borderRadius: '8px', fontSize: '0.9em'}}>{userReply}</div>}
      </div>
    </div>
  );
};

// ==============================================================================
// 【モニターモード】
// ==============================================================================
const MonitorMode = ({ familyId, onBack }: { familyId: string, onBack: () => void }) => {
  const [cameras, setCameras] = useState<any>({});
  const [log, setLog] = useState<string[]>([]);
  const [targetEmail, setTargetEmail] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const lastSentTimeRef = useRef(0);

  useEffect(() => {
    const familyRef = ref(db, `families/${familyId}`);
    const unsubscribe = onValue(familyRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const firebaseEmail = data.settings?.email || "";
        setTargetEmail(firebaseEmail);
        if (document.activeElement?.tagName !== "INPUT") setEmailInput(firebaseEmail);
        
        const cameraData: any = {};
        Object.keys(data).forEach(k => { if (k !== 'settings') cameraData[k] = data[k]; });
        setCameras(cameraData);
        checkAlert(cameraData, firebaseEmail);
      }
    });
    return () => unsubscribe();
  }, [familyId]);

  const saveEmail = () => {
    set(ref(db, `families/${familyId}/settings`), { email: emailInput });
    setTargetEmail(emailInput);
    alert("通知設定を保存しました．");
  };

  const checkAlert = (cameraData: any, email: string) => {
    const now = Date.now();
    Object.keys(cameraData).forEach(deviceId => {
        const cam = cameraData[deviceId];
        if (cam.status === "FALL" && email && (now - lastSentTimeRef.current > 60000)) {
            const logMsg = `🚨 ${deviceId}：転倒検知（AI判断：${cam.aiReason || "不明"}）`;
            setLog(prev => [new Date().toLocaleTimeString() + " " + logMsg, ...prev]);
            emailjs.send(SERVICE_ID, TEMPLATE_ID, { user_email: email, reason: cam.aiReason, user_said: cam.userSaid }, PUBLIC_KEY);
            lastSentTimeRef.current = now;
        } else if (cam.aiReply && cam.status === "SAFE") {
            const logMsg = `✅ ${deviceId}：安全確認（AI返答：「${cam.aiReply}」）`;
            if (log[0] !== logMsg) setLog(prev => [new Date().toLocaleTimeString() + " " + logMsg, ...prev.slice(0, 15)]);
        }
    });
  };

  return (
    <div style={{ backgroundColor: '#f0f2f5', minHeight: '100vh', padding: '40px 20px' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <h1 style={{ fontSize: '1.5em', color: '#1c1e21', margin: 0 }}>統合監視モニター <span style={{fontSize: '0.6em', color: '#666', fontWeight: 'normal'}}>Group: {familyId}</span></h1>
          <button onClick={onBack} style={{...btnStyle, width: 'auto', padding: '8px 20px', background: '#fff', color: '#555', border: '1px solid #ddd'}}>⬅ 戻る</button>
        </div>

        {/* 【復元】通知先設定セクション */}
        <div style={{ ...monitorCardStyle, marginBottom: '30px', padding: '20px' }}>
          <h3 style={{ marginTop: 0, fontSize: '1.1em', color: '#444' }}>📩 緊急通知先の設定</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input 
              type="email" 
              value={emailInput} 
              onChange={e => setEmailInput(e.target.value)} 
              placeholder="通知を受け取るメールアドレス" 
              style={{ ...inputStyle, marginBottom: 0, flex: 1 }} 
            />
            <button onClick={saveEmail} style={{ ...btnStyle, width: 'auto', background: '#007bff' }}>共有設定を保存</button>
          </div>
          <div style={{marginTop: '10px', fontSize: '0.85em', color: '#666'}}>現在の設定： <b>{targetEmail || "（未設定）"}</b></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', marginBottom: '40px' }}>
          {Object.keys(cameras).length === 0 && <div style={{gridColumn: '1/-1', textAlign: 'center', padding: '40px', background: '#fff', borderRadius: '15px', color: '#999'}}>カメラの接続を待機中．．．</div>}
          {Object.keys(cameras).map(k => {
            const cam = cameras[k];
            const isFall = cam.status === 'FALL';
            return (
              <div key={k} style={{ ...monitorCardStyle, borderTop: `6px solid ${isFall ? '#dc3545' : '#28a745'}` }}>
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '10px'}}>
                  <span style={{fontWeight: 'bold', color: '#666'}}>{k}</span>
                  <span style={{fontSize: '0.8em', color: isFall ? '#dc3545' : '#28a745'}}>{isFall ? '● 緊急' : '● 正常'}</span>
                </div>
                <div style={{ fontSize: '2.5em', fontWeight: 'bold', margin: '15px 0', color: isFall ? '#dc3545' : '#28a745' }}>{cam.status}</div>
                {cam.userSaid && <div style={camDetailStyle}><strong>利用者：</strong>{cam.userSaid}</div>}
                {cam.aiReply && <div style={camDetailStyle}><strong>AI返答：</strong>{cam.aiReply}</div>}
              </div>
            )
          })}
        </div>

        <div style={{ background: '#fff', borderRadius: '15px', padding: '25px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.1em', color: '#444', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>システムログ</h3>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {log.length === 0 && <li style={{color: '#ccc', textAlign: 'center', padding: '20px'}}>ログはありません．</li>}
                {log.map((l, i) => <li key={i} style={logItemStyle}>{l}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==============================================================================
// スタイル定義
// ==============================================================================
const containerStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f2f5', fontFamily: '"Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif' };
const cardStyle: React.CSSProperties = { background: '#fff', padding: '40px', borderRadius: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', width: '90%', maxWidth: '400px', textAlign: 'center' };
const btnStyle: React.CSSProperties = { padding: '15px 25px', fontSize: '1em', cursor: 'pointer', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', width: '100%', transition: 'all 0.2s ease', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' };
const inputStyle: React.CSSProperties = { padding: '15px', fontSize: '1em', borderRadius: '10px', border: '1px solid #ddd', width: '100%', boxSizing: 'border-box', marginBottom: '10px', outline: 'none' };
const backBtnStyle: React.CSSProperties = { position: 'absolute', top: 25, left: 25, zIndex: 100, background: 'rgba(255,255,255,0.9)', color: '#333', border: 'none', borderRadius: '30px', padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' };
const overlayContainerStyle: React.CSSProperties = { position: 'absolute', bottom: 50, left: '50%', transform: 'translateX(-50%)', width: '85%', maxWidth: '500px', padding: '25px', borderRadius: '20px', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', zIndex: 50, transition: 'all 0.3s ease' };
const monitorCardStyle: React.CSSProperties = { background: '#fff', padding: '25px', borderRadius: '15px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' };
const camDetailStyle: React.CSSProperties = { fontSize: '0.85em', color: '#666', marginTop: '8px', borderTop: '1px solid #f0f0f0', paddingTop: '8px', textAlign: 'left' };
const logItemStyle: React.CSSProperties = { padding: '12px 0', borderBottom: '1px solid #f9f9f9', fontSize: '0.9em', color: '#555' };

export default App;