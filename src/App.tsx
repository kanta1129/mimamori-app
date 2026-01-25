import { useEffect, useRef, useState } from 'react';
import * as tmPose from '@teachablemachine/pose';
import emailjs from '@emailjs/browser';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, serverTimestamp } from "firebase/database";

// ==============================================================================
// 設定エリア (環境変数)
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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const CAMERA_WIDTH = 400;
const CAMERA_HEIGHT = 400;

// 音声認識の型定義 (ブラウザ互換性用)
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
          alert("メールアドレスを入力してください");
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
        <h1 style={{color: '#333', margin: '0 0 20px 0'}}>見守りシステムへようこそ</h1>
        {!isInputMode && !isCreating && (
          <div style={{display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '300px'}}>
            <button onClick={startCreation} style={{...btnStyle, background: '#007bff'}}>🆕 新しいグループを作成</button>
            <button onClick={() => setIsInputMode(true)} style={{...btnStyle, background: 'white', color: '#555', border: '1px solid #ccc'}}>🔑 既存のグループに参加</button>
          </div>
        )}
        {isCreating && (
          <div style={{display: 'flex', flexDirection: 'column', gap: '15px', width: '100%', maxWidth: '300px'}}>
             <div style={{textAlign: 'center', marginBottom: '10px'}}>
                <p style={{margin: 0, fontSize: '0.9em', color: '#666'}}>あなたのグループID</p>
                <p style={{margin: '5px 0', fontSize: '1.4em', fontWeight: 'bold', color: '#007bff'}}>{newFamilyId}</p>
             </div>
             <p style={{margin: 0, fontWeight: 'bold', color: '#444'}}>管理者メールアドレスの設定</p>
             <input type="email" placeholder="例: parent@example.com" value={setupEmail} onChange={(e) => setSetupEmail(e.target.value)} style={inputStyle} />
             <button onClick={completeCreation} style={{...btnStyle, background: '#007bff'}}>設定して開始</button>
             <button onClick={() => setIsCreating(false)} style={{background: 'none', border: 'none', color: '#666', cursor: 'pointer', textDecoration: 'underline'}}>戻る</button>
          </div>
        )}
        {isInputMode && (
          <div style={{display: 'flex', flexDirection: 'column', gap: '15px', width: '100%', maxWidth: '300px'}}>
            <p style={{textAlign: 'center', margin: 0}}>共有されたIDを入力してください</p>
            <input type="text" placeholder="例: fam_xyz123" value={tempInputId} onChange={(e) => setTempInputId(e.target.value)} style={inputStyle} />
            <button onClick={() => saveAndProceed(tempInputId)} style={{...btnStyle, background: '#28a745'}}>決定して次へ</button>
            <button onClick={() => setIsInputMode(false)} style={{background: 'none', border: 'none', color: '#666', cursor: 'pointer', textDecoration: 'underline'}}>戻る</button>
          </div>
        )}
      </div>
    );
  }

  if (mode === 'select') {
    return (
      <div style={containerStyle}>
        <h1 style={{color: '#333'}}>システム選択</h1>
        <div style={{padding: '20px', background: 'white', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', marginBottom: '20px', textAlign: 'center', width: '80%', maxWidth: '300px'}}>
          <p style={{margin: '0', fontSize: '0.9em', color: '#666'}}>あなたのグループID</p>
          <p style={{margin: '5px 0 0', fontSize: '1.8em', fontWeight: 'bold', color: '#007bff', fontFamily: 'monospace'}}>{familyId}</p>
          <button onClick={() => { localStorage.removeItem('familyId'); setMode('setup'); setIsInputMode(false); setIsCreating(false); }} style={{marginTop: '15px', fontSize: '0.8em', background: 'none', border: 'none', color: '#999', cursor: 'pointer', textDecoration: 'underline'}}>IDを変更・リセット</button>
        </div>
        <div style={{display: 'flex', flexDirection: 'column', gap: '15px', width: '100%', maxWidth: '300px'}}>
          <button onClick={() => setMode('camera')} style={{...btnStyle, background: '#007bff'}}>📷 カメラとして起動</button>
          <button onClick={() => setMode('monitor')} style={{...btnStyle, background: '#28a745'}}>💻 モニターとして起動</button>
        </div>
      </div>
    );
  }

  return mode === 'camera' 
    ? <CameraMode familyId={familyId} onBack={() => setMode('select')} /> 
    : <MonitorMode familyId={familyId} onBack={() => setMode('select')} />;
};

// ==============================================================================
// 【カメラモード】 (修正: 権限一括取得 & 音声確認の調整)
// ==============================================================================
const CameraMode = ({ familyId, onBack }: { familyId: string, onBack: () => void }) => {
  const deviceId = getDeviceId();
  const [statusText, setStatusText] = useState("起動中...");
  const [isAlert, setIsAlert] = useState(false);
  
  // AI対話の状態
  const [aiState, setAiState] = useState<'idle' | 'asking' | 'listening' | 'cooldown'>('idle');
  const [userReply, setUserReply] = useState("");

  const webcamRef = useRef<tmPose.Webcam | null>(null);
  const modelRef = useRef<tmPose.CustomPoseNet | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const loopRef = useRef<number>(0);
  const cooldownTimerRef = useRef<number>(0);
  const retryCountRef = useRef(0);
  const lastStateRef = useRef(""); 

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      try {
        setStatusText("カメラとマイクの権限を確認中...");

        // ★修正点: カメラとマイクの権限を同時にリクエスト
        // これにより、ブラウザの許可ポップアップを1回にまとめることができます
        await navigator.mediaDevices.getUserMedia({
            video: { width: CAMERA_WIDTH, height: CAMERA_HEIGHT },
            audio: true
        });

        const modelURL = "./my-pose-model/model.json";
        const metadataURL = "./my-pose-model/metadata.json";
        modelRef.current = await tmPose.load(modelURL, metadataURL);

        // tmPoseのWebcamセットアップ（既に権限があるのでスムーズに通過します）
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
            setStatusText(`Group: ${familyId}\nID: ${deviceId}`);
            loop(); 
        }
      } catch (e) {
        console.error(e);
        if (isMounted) setStatusText("エラー: カメラとマイクの許可が必要です。\nブラウザの設定を確認してください。");
      }
    };
    init();
    return () => {
        isMounted = false;
        if (loopRef.current) cancelAnimationFrame(loopRef.current);
        if (webcamRef.current) webcamRef.current.stop();
        clearTimeout(cooldownTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loop = async () => {
    if (webcamRef.current && modelRef.current && webcamRef.current.canvas) {
      webcamRef.current.update();
      await predict();
      loopRef.current = requestAnimationFrame(loop);
    }
  };

  const speak = (text: string, onEnd?: () => void) => {
      // 連続で呼ばれても大丈夫なようにキャンセルを入れる
      window.speechSynthesis.cancel();

      const msg = new SpeechSynthesisUtterance(text);
      msg.lang = 'ja-JP';
      msg.onend = () => { if(onEnd) onEnd(); };
      window.speechSynthesis.speak(msg);
  };

  const startListening = () => {
    if (!SpeechRecognition) {
        console.error("SpeechRecognition not supported");
        handleNoResponse();
        return;
    }

    setAiState('listening');
    setStatusText("👂 返事を聞いています...");
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
        const reply = event.results[0][0].transcript;
        console.log("User said:", reply);
        setUserReply(`「${reply}」`);
        handleUserResponse(reply);
    };

    recognition.onerror = () => {
        handleNoResponse();
    };

    recognition.onend = () => {
        // 必要ならここでタイムアウト処理など
    };

    try {
        recognition.start();
    } catch (e) {
        console.error(e);
        handleNoResponse();
    }
  };

  const handleUserResponse = (text: string) => {
      const safeKeywords = ["筋トレ", "トレーニング", "運動", "大丈夫", "昼寝", "寝る", "寝て", "元気", "はい"];
      const isSafe = safeKeywords.some(keyword => text.includes(keyword));

      if (isSafe) {
          speak("分かりました。監視を一時停止します。");
          setAiState('cooldown');
          setIsAlert(false);
          
          cooldownTimerRef.current = window.setTimeout(() => {
              setAiState('idle');
              setUserReply("");
          }, 180000); // 3分間停止
          
          set(ref(db, `families/${familyId}/${deviceId}`), {
            status: "SAFE",
            probability: 0,
            lastUpdate: serverTimestamp()
          });

      } else {
          // 聞き取れなかった、または否定的な言葉の場合
          if (retryCountRef.current < 1) {
              retryCountRef.current++;
              speak("すみません、もう一度お願いします。", () => startListening());
          } else {
              speak("緊急事態と判断しました。通知を送ります。");
              sendAlertForce();
          }
      }
  };

  const handleNoResponse = () => {
      // 「一生聞いてくる」のを防ぐため、2回聞いたら諦めて通知する
      if (retryCountRef.current < 2) {
          retryCountRef.current++;
          speak("大丈夫ですか？", () => startListening());
      } else {
          speak("応答がないため、通知を送ります。");
          sendAlertForce();
      }
  };

  const sendAlertForce = () => {
      setAiState('cooldown'); 
      setIsAlert(true);
      setStatusText("🚨 通知送信済み\n(60秒間 監視を一時停止)");

      set(ref(db, `families/${familyId}/${deviceId}`), {
        status: "FALL",
        probability: 100,
        lastUpdate: serverTimestamp()
      });
      
      // 通知後60秒はクールダウン（連続通知防止）
      cooldownTimerRef.current = window.setTimeout(() => {
          setAiState('idle');
          setIsAlert(false);
          retryCountRef.current = 0;
      }, 60000); 
  };

  const predict = async () => {
    if (aiState !== 'idle') return;
    
    if (!webcamRef.current || !modelRef.current || !webcamRef.current.canvas) return;
    const { posenetOutput } = await modelRef.current.estimatePose(webcamRef.current.canvas);
    const prediction = await modelRef.current.predict(posenetOutput);
    const best = prediction.reduce((prev, current) => (prev.probability > current.probability) ? prev : current);
    
    const isFall = (best.className === "Fall" || best.className === "転倒" || best.className === "倒れている") && best.probability > 0.9;
    
    if (isFall) {
        setAiState('asking');
        setStatusText("🗣️ 声かけ中...");
        retryCountRef.current = 0;
        speak("転倒を検知しました。大丈夫ですか？", () => {
            startListening();
        });
    } else {
        setIsAlert(false);
        if (lastStateRef.current !== "SAFE") {
             set(ref(db, `families/${familyId}/${deviceId}`), {
                status: "SAFE",
                probability: Math.round(best.probability * 100),
                lastUpdate: serverTimestamp()
            });
            lastStateRef.current = "SAFE";
        }
    }
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', backgroundColor: '#000', overflow: 'hidden' }}>
      <button onClick={onBack} style={{position: 'absolute', top: 20, left: 20, zIndex: 100, background: 'rgba(0,0,0,0.6)', color: 'white', border: '1px solid rgba(255,255,255,0.5)', borderRadius: '30px', padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold'}}>⬅ もどる</button>
      <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }} />
      
      <div style={{ position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)', width: '85%', padding: '15px', background: aiState === 'cooldown' ? 'rgba(40, 167, 69, 0.9)' : (aiState !== 'idle' ? 'rgba(255, 193, 7, 0.95)' : 'rgba(255,255,255,0.9)'), borderRadius: '15px', textAlign: 'center', color: aiState === 'cooldown' ? '#fff' : '#000', fontWeight: 'bold', whiteSpace: 'pre-wrap', boxShadow: '0 4px 15px rgba(0,0,0,0.3)', fontSize: '1.1em', zIndex: 50 }}>
        {aiState === 'idle' ? statusText : 
         aiState === 'cooldown' ? (isAlert ? "🚨 通知送信済み\n(60秒間 監視を一時停止)" : `✅ 安全確認済み\n(3分間監視停止中)`) :
         <div>
             <div>{statusText}</div>
             {userReply && <div style={{marginTop: '10px', fontSize: '0.9em', color: '#333'}}>認識結果: {userReply}</div>}
         </div>
        }
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
  const lastSentTimeRef = useRef(0);
  const lastLogTimeRef = useRef(0);
  const [targetEmail, setTargetEmail] = useState('');
  const [emailInput, setEmailInput] = useState('');

  useEffect(() => {
    const familyRef = ref(db, `families/${familyId}`);
    const unsubscribe = onValue(familyRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const firebaseEmail = data.settings?.email || "";
        setTargetEmail(firebaseEmail);
        if (document.activeElement?.tagName !== "INPUT") setEmailInput(firebaseEmail);
        const cameraData: any = {};
        Object.keys(data).forEach(key => { if (key !== 'settings') cameraData[key] = data[key]; });
        setCameras(cameraData);
        checkAlert(cameraData, firebaseEmail);
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
    Object.keys(cameraData).forEach(key => { if (cameraData[key].status === "FALL") { anyFall = true; fallDevice = key; } });

    if (anyFall) {
        if (now - lastLogTimeRef.current > 3000) {
            let logMsg = "";
            if (!currentEmail) logMsg = `⚠️ 転倒検知 (メアド未設定のため送信不可)`;
            else if (now - lastSentTimeRef.current > 60000) logMsg = `🚀 転倒検知！メール送信を実行します...`;
            else { const waitSec = Math.ceil((60000 - (now - lastSentTimeRef.current)) / 1000); logMsg = `⏳ 転倒継続中... (メール連射防止: あと${waitSec}秒)`; }
            setLog(prev => [new Date().toLocaleTimeString() + " " + logMsg, ...prev]);
            lastLogTimeRef.current = now;
        }
        if (currentEmail && (now - lastSentTimeRef.current > 60000)) {
            sendEmail(fallDevice, currentEmail);
            lastSentTimeRef.current = now;
        }
    }
  };

  const sendEmail = (deviceId: string, toEmail: string) => {
    console.log("Sending email to", toEmail);
    const templateParams = { to_name: "管理者様", user_email: toEmail, probability: "100", time: new Date().toLocaleTimeString() + ` (Device: ${deviceId})` };
    emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, PUBLIC_KEY)
      .then(() => setLog(prev => [new Date().toLocaleTimeString() + " ✅ メール送信成功！", ...prev]))
      .catch(err => console.error(err));
  };

  const saveEmail = () => {
      set(ref(db, `families/${familyId}/settings`), { email: emailInput });
      setTargetEmail(emailInput);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial', maxWidth: '1200px', margin: '0 auto', width: '95%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
          <button onClick={onBack} style={{background: 'white', border: '1px solid #ccc', borderRadius: '5px', padding: '8px 15px', cursor: 'pointer', marginRight: '15px', fontWeight: 'bold', color: '#555'}}>⬅ もどる</button>
          <h1 style={{ margin: 0, fontSize: '1.4em', color: '#333' }}>💻 統合監視モニター</h1>
      </div>
      <div style={{ marginBottom: '20px', padding: '10px', background: '#e8f0fe', borderRadius: '5px', color: '#0d47a1', fontSize: '0.9em'}}>現在監視中のグループID: <strong style={{fontSize: '1.2em', marginLeft: '5px'}}>{familyId}</strong></div>
      <div style={{ marginBottom: '20px', padding: '20px', background: '#fff', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <h3 style={{marginTop: 0, fontSize: '1.1em', color: '#444'}}>📩 通知先設定 (グループ共有)</h3>
        <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
            <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder="メールアドレスを入力" style={inputStyle} />
            <button onClick={saveEmail} style={{ padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>共有設定を保存</button>
        </div>
        <div style={{marginTop: '10px', fontSize: '0.9em', color: '#666'}}>現在の設定（DB参照）: <b>{targetEmail || "（未設定）"}</b></div>
      </div>
      <h3 style={{fontSize: '1.1em', color: '#444'}}>📷 接続中のカメラ</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
        {Object.keys(cameras).length === 0 && <div style={{padding: '30px', background: '#f9f9f9', borderRadius: '10px', textAlign: 'center', color: '#888', gridColumn: '1 / -1'}}>カメラがまだ接続されていません。<br/>スマホで同じIDを入力して起動してください。</div>}
        {Object.keys(cameras).map(key => {
            const cam = cameras[key];
            const isFall = cam.status === "FALL";
            return (
                <div key={key} style={{ padding: '20px', borderRadius: '12px', color: '#fff', background: isFall ? '#dc3545' : '#28a745', textAlign: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', transition: 'all 0.3s ease' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '5px', fontSize: '0.9em', opacity: 0.9 }}>{key}</div>
                    <div style={{ fontSize: '1.8em', margin: '10px 0', fontWeight: 'bold' }}>{cam.status}</div>
                    <div style={{ fontSize: '0.8em', opacity: 0.9 }}>確信度: {cam.probability}%</div>
                </div>
            )
        })}
      </div>
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

// スタイル
const containerStyle = { display: 'flex' as const, flexDirection: 'column' as const, height: '100vh', width: '100vw', justifyContent: 'center', alignItems: 'center', gap: '20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', backgroundColor: '#f5f7fa', margin: 0, padding: 0 };
const btnStyle = { padding: '15px 20px', fontSize: '1.1em', cursor: 'pointer', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', width: '100%', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', transition: 'transform 0.1s ease' };
const inputStyle = { padding: '12px', fontSize: '1em', borderRadius: '8px', border: '1px solid #ccc', width: '100%', boxSizing: 'border-box' as const, flex: 1 };

export default App;