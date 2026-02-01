import React, { useState, useRef, useEffect, useCallback } from "react";
import {
    Camera,
    Download,
    RefreshCw,
    Heart,
    Star,
    Sparkles,
    Image as ImageIcon,
    Check,
    Upload,
    Palette,
    ZoomIn,
    ZoomOut,
    ImagePlus,
} from "lucide-react";

/**
 * 拍貼機應用程式（純 CSS 版本）
 * - 不使用 Tailwind
 * - 所有樣式在 App.css（pb- namespace）
 */

// 預設顏色選項
const COLOR_PALETTE = [
    "#ffffff",
    "#000000",
    "#fce7f3",
    "#dbeafe",
    "#fef3c7",
    "#d1fae5",
    "#e5e7eb",
    "#c084fc",
];

// 定義相框主題樣式
const FRAMES = [
    {
        id: "simple",
        name: "簡約風格",
        icon: <div className="pb-frameIcon pb-frameIcon--simple" />,
        decoration: (ctx, width, height, color) => {
            ctx.font = "bold 24px sans-serif";
            ctx.fillStyle = color === "#000000" || color === "#171717" ? "#ffffff" : "#000000";
            ctx.textAlign = "center";
            ctx.fillText("PHOTO BOOTH", width / 2, height - 30);
            ctx.font = "14px sans-serif";
            ctx.fillText(new Date().toLocaleDateString(), width / 2, height - 12);
        },
    },
    {
        id: "cute",
        name: "可愛裝飾",
        icon: <div className="pb-frameIcon pb-frameIcon--cute" />,
        decoration: (ctx, width, height, color) => {
            const isDark = color === "#000000" || color === "#171717";
            const decorColor = isDark ? "#fda4af" : "#e11d48";

            ctx.fillStyle = decorColor;
            ctx.font = "30px sans-serif";
            ctx.fillText("♥", 30, 40);
            ctx.fillText("♥", width - 40, height - 40);

            ctx.font = 'bold 28px "Comic Sans MS", cursive';
            ctx.textAlign = "center";
            ctx.fillText("SWEET MEMORY", width / 2, height - 35);
        },
    },
    {
        id: "film",
        name: "底片感",
        icon: <div className="pb-frameIcon pb-frameIcon--film" />,
        decoration: (ctx, width, height, color) => {
            ctx.fillStyle = color === "#ffffff" ? "#000000" : "#ffffff";
            const gap = 40;

            for (let y = 20; y < height; y += gap) ctx.fillRect(10, y, 15, 10);
            for (let y = 20; y < height; y += gap) ctx.fillRect(width - 25, y, 15, 10);

            ctx.font = "bold 20px monospace";
            ctx.fillStyle = "#fbbf24";
            ctx.textAlign = "center";
            ctx.fillText(new Date().toISOString().split("T")[0], width / 2, height - 20);
        },
    },
];

export default function App() {
    const [step, setStep] = useState("landing"); // landing, setup, camera, result
    const [selectedFrame, setSelectedFrame] = useState(FRAMES[0]);
    const [customColor, setCustomColor] = useState("#ffffff");
    const [overlayImage, setOverlayImage] = useState(null);
    const [photos, setPhotos] = useState([]);
    const [countdown, setCountdown] = useState(null);
    const [flash, setFlash] = useState(false);

    // 合照圖層的移動與縮放狀態
    const [overlayPos, setOverlayPos] = useState({ x: 0, y: 0 });
    const [overlayScale, setOverlayScale] = useState(1);
    const [isDragging, setIsDragging] = useState(false);

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const resultCanvasRef = useRef(null);
    const overlayImgRef = useRef(null);
    const cameraContainerRef = useRef(null);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const initialPosRef = useRef({ x: 0, y: 0 });
    const cameraFileInputRef = useRef(null);

    const [downloadUrl, setDownloadUrl] = useState("");

    // 啟動相機
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "user",
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
                audio: false,
            });
            if (videoRef.current) videoRef.current.srcObject = stream;
            streamRef.current = stream;
        } catch (err) {
            console.error("Error accessing camera:", err);
            alert("無法存取相機，請確認瀏覽器權限設置。");
        }
    };

    // 停止相機
    const stopCamera = () => {
        if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };

    // 處理圖片上傳
    const handleImageUpload = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                setOverlayImage(ev.target.result);
                setOverlayPos({ x: 0, y: 0 });
                setOverlayScale(1);
            };
            reader.readAsDataURL(file);
        }
        e.target.value = null;
    };

    const triggerCameraFileUpload = () => {
        cameraFileInputRef.current?.click();
    };

    // --- 拖曳邏輯 ---
    const handlePointerDown = (e) => {
        if (!overlayImage) return;
        e.preventDefault();
        setIsDragging(true);

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        dragStartRef.current = { x: clientX, y: clientY };
        initialPosRef.current = { ...overlayPos };
    };

    const handlePointerMove = (e) => {
        if (!isDragging) return;
        e.preventDefault();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const dx = clientX - dragStartRef.current.x;
        const dy = clientY - dragStartRef.current.y;

        setOverlayPos({
            x: initialPosRef.current.x + dx,
            y: initialPosRef.current.y + dy,
        });
    };

    const handlePointerUp = () => setIsDragging(false);

    // 拍照邏輯（精準合成 Overlay）
    const takePhoto = useCallback(() => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");

        const aspect = 4 / 3;
        const videoHeight = video.videoHeight;
        const videoWidth = video.videoWidth;

        let drawWidth = videoWidth;
        let drawHeight = videoWidth / aspect;
        let startX = 0;
        let startY = (videoHeight - drawHeight) / 2;

        if (drawHeight > videoHeight) {
            drawHeight = videoHeight;
            drawWidth = videoHeight * aspect;
            startY = 0;
            startX = (videoWidth - drawWidth) / 2;
        }

        canvas.width = 640;
        canvas.height = 480;

        // 1. 鏡像繪製相機畫面
        context.save();
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
        context.drawImage(video, startX, startY, drawWidth, drawHeight, 0, 0, canvas.width, canvas.height);
        context.restore();

        // 2. 繪製 Overlay
        if (overlayImgRef.current && overlayImage && cameraContainerRef.current) {
            const containerWidth = cameraContainerRef.current.clientWidth;
            const ratio = canvas.width / containerWidth;

            context.save();
            context.translate(canvas.width / 2, canvas.height / 2);
            context.translate(overlayPos.x * ratio, overlayPos.y * ratio);
            context.scale(overlayScale, overlayScale);
            context.translate(-canvas.width / 2, -canvas.height / 2);

            const img = overlayImgRef.current;
            const imgRatio = img.naturalWidth / img.naturalHeight;
            const canvasRatio = canvas.width / canvas.height;

            let renderW, renderH;
            if (imgRatio > canvasRatio) {
                renderW = canvas.width;
                renderH = renderW / imgRatio;
            } else {
                renderH = canvas.height;
                renderW = renderH * imgRatio;
            }

            const renderX = (canvas.width - renderW) / 2;
            const renderY = (canvas.height - renderH) / 2;

            context.drawImage(img, renderX, renderY, renderW, renderH);
            context.restore();
        }

        const photoData = canvas.toDataURL("image/png");
        setPhotos((prev) => [...prev, photoData]);

        setFlash(true);
        setTimeout(() => setFlash(false), 200);
    }, [overlayImage, overlayPos, overlayScale]);

    const startCountdownAndCapture = () => {
        let count = 3;
        setCountdown(count);

        const timer = setInterval(() => {
            count--;
            if (count > 0) {
                setCountdown(count);
            } else {
                clearInterval(timer);
                setCountdown(null);
                takePhoto();
            }
        }, 1000);
    };

    // 生成最終圖片條
    useEffect(() => {
        if (step === "result" && photos.length > 0 && resultCanvasRef.current) {
            const canvas = resultCanvasRef.current;
            const ctx = canvas.getContext("2d");
            const frame = selectedFrame;

            const photoWidth = 640;
            const photoHeight = 480;
            const padding = 40;
            const headerHeight = 80;
            const footerHeight = 100;
            const gap = 20;

            const totalWidth = photoWidth + padding * 2;
            const totalHeight =
                headerHeight + photoHeight * photos.length + gap * (photos.length - 1) + footerHeight;

            canvas.width = totalWidth;
            canvas.height = totalHeight;

            ctx.fillStyle = customColor;
            ctx.fillRect(0, 0, totalWidth, totalHeight);

            if (frame.decoration) frame.decoration(ctx, totalWidth, totalHeight, customColor);

            let loadedImages = 0;
            photos.forEach((photoData, index) => {
                const img = new Image();
                img.onload = () => {
                    const yPos = headerHeight + index * (photoHeight + gap);

                    ctx.fillStyle = "rgba(0,0,0,0.1)";
                    ctx.fillRect(padding + 5, yPos + 5, photoWidth, photoHeight);

                    ctx.drawImage(img, padding, yPos, photoWidth, photoHeight);

                    if (frame.id === "film") {
                        ctx.globalCompositeOperation = "color";
                        ctx.fillStyle = "rgba(255, 200, 100, 0.2)";
                        ctx.fillRect(padding, yPos, photoWidth, photoHeight);

                        ctx.globalCompositeOperation = "overlay";
                        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
                        ctx.fillRect(padding, yPos, photoWidth, photoHeight);

                        ctx.globalCompositeOperation = "source-over";
                    }

                    loadedImages++;
                    if (loadedImages === photos.length) setDownloadUrl(canvas.toDataURL("image/png"));
                };
                img.src = photoData;
            });
        }
    }, [step, photos, selectedFrame, customColor]);

    useEffect(() => {
        if (step === "camera") startCamera();
        else stopCamera();
        return () => stopCamera();
    }, [step]);

    useEffect(() => {
        if (photos.length === 4 && step === "camera") {
            setTimeout(() => setStep("result"), 1000);
        }
    }, [photos, step]);

    const handleReset = () => {
        setPhotos([]);
        setStep("setup");
        setDownloadUrl("");
        setOverlayImage(null);
        setOverlayPos({ x: 0, y: 0 });
        setOverlayScale(1);
    };

    // 1) Landing
    if (step === "landing") {
        return (
            <div className="pb pb-landing" onClick={() => setStep("setup")}>
                <div className="pb-landingGradient" />
                <div className="pb-landingDots" />

                <div className="pb-landingStar pb-animateBounce pb-delay100">
                    <Star size={48} fill="currentColor" />
                </div>
                <div className="pb-landingSparkles pb-animateBounce pb-delay700">
                    <Sparkles size={56} />
                </div>
                <div className="pb-landingHeart pb-animatePulse">
                    <Heart size={32} fill="currentColor" />
                </div>

                <div className="pb-landingContent">
                    <div className="pb-landingTitleWrap">
                        <div className="pb-landingBadge">★ MEMORY BOOTH ★</div>
                        <h1 className="pb-landingTitle">拍貼機</h1>
                    </div>

                    <div className="pb-landingStartWrap pb-animatePulse">
                        <div className="pb-landingStartBtn">
                            <Camera size={40} />
                            START
                        </div>
                        <p className="pb-landingSub">點擊螢幕開始</p>
                    </div>
                </div>

                <div className="pb-landingFooter">READY • 4 POSES • PRINT</div>
            </div>
        );
    }

    // 2) Setup
    if (step === "setup") {
        return (
            <div className="pb pb-setup">
                <div className="pb-wrap pb-wrapMd">
                    <div className="pb-card pb-cardBordered">
                        <h2 className="pb-h2">
                            <Upload size={18} className="pb-iconIndigo" /> 上傳合照對象 (選填)
                        </h2>
                        <p className="pb-muted">上傳偶像或朋友的去背 PNG，拍照時可以移動調整喔！</p>

                        <div className="pb-uploadGroup">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="pb-hidden"
                                id="overlay-upload"
                            />
                            <label htmlFor="overlay-upload" className="pb-uploadDrop">
                                {overlayImage ? (
                                    <div className="pb-uploadPreview">
                                        <img src={overlayImage} alt="Overlay" />
                                        <div className="pb-uploadHover">
                                            <span>更換照片</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="pb-uploadEmpty">
                                        <ImageIcon size={32} />
                                        <span>點擊上傳圖片</span>
                                    </div>
                                )}
                            </label>

                            {overlayImage && (
                                <button onClick={() => setOverlayImage(null)} className="pb-clearBtn" type="button">
                                    清除照片
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="pb-section">
                        <h2 className="pb-sectionTitle">預設風格 (拍完可改色)</h2>
                        <div className="pb-frameList">
                            {FRAMES.map((frame) => (
                                <button
                                    key={frame.id}
                                    onClick={() => setSelectedFrame(frame)}
                                    className={`pb-frameBtn ${selectedFrame.id === frame.id ? "is-selected" : ""}`}
                                    type="button"
                                >
                                    {frame.icon}
                                    <div className="pb-frameText">
                                        <h3 className="pb-frameName">{frame.name}</h3>
                                    </div>
                                    {selectedFrame.id === frame.id && <Check size={22} className="pb-iconIndigo" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            setPhotos([]);
                            setStep("camera");
                        }}
                        className="pb-primaryBtn"
                        type="button"
                    >
                        開始拍照 →
                    </button>
                </div>
            </div>
        );
    }

    // 3) Camera
    if (step === "camera") {
        return (
            <div
                className="pb pb-camera"
                onPointerUp={handlePointerUp}
                onPointerMove={handlePointerMove}
            >
                <div className="pb-cameraTop">
                    <span className="pb-badgeDark">{selectedFrame.name}</span>
                    <div className="pb-dots">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className={`pb-dot ${i < photos.length ? "is-on" : ""}`} />
                        ))}
                    </div>
                </div>

                <div ref={cameraContainerRef} className="pb-cameraWindow">
                    <video ref={videoRef} autoPlay playsInline className="pb-cameraVideo" />

                    {overlayImage && (
                        <div
                            className="pb-overlayLayer"
                            onPointerDown={handlePointerDown}
                            style={{ outline: isDragging ? "2px dashed rgba(255,255,255,0.5)" : "none" }}
                        >
                            <img
                                ref={overlayImgRef}
                                src={overlayImage}
                                alt="overlay"
                                draggable="false"
                                style={{
                                    transform: `translate(${overlayPos.x}px, ${overlayPos.y}px) scale(${overlayScale})`,
                                    transition: isDragging ? "none" : "transform 0.1s ease-out",
                                }}
                            />
                        </div>
                    )}

                    {overlayImage && photos.length === 0 && (
                        <div className="pb-overlayHint">
                            <span className="pb-animatePulse">拖曳可移動照片 • 下方可縮放</span>
                        </div>
                    )}

                    {flash && <div className="pb-flash" />}

                    {countdown !== null && (
                        <div className="pb-countdown">
                            <span className="pb-animatePing">{countdown}</span>
                        </div>
                    )}
                </div>

                <div className="pb-cameraControls">
                    <div className="pb-overlayControls">
                        <input
                            type="file"
                            accept="image/*"
                            ref={cameraFileInputRef}
                            onChange={handleImageUpload}
                            className="pb-hidden"
                        />

                        {overlayImage ? (
                            <div className="pb-overlayPill">
                                <button
                                    onClick={triggerCameraFileUpload}
                                    className="pb-iconBtn"
                                    title="更換照片"
                                    type="button"
                                >
                                    <ImageIcon size={16} />
                                </button>
                                <div className="pb-divider" />
                                <ZoomOut size={16} className="pb-iconMuted" />
                                <input
                                    type="range"
                                    min="0.5"
                                    max="2"
                                    step="0.1"
                                    value={overlayScale}
                                    onChange={(e) => setOverlayScale(parseFloat(e.target.value))}
                                    className="pb-range"
                                />
                                <ZoomIn size={16} />
                            </div>
                        ) : (
                            <button onClick={triggerCameraFileUpload} className="pb-overlayAdd" type="button">
                                <ImagePlus size={16} /> 新增合照對象
                            </button>
                        )}
                    </div>

                    <div className="pb-shutterRow">
                        <div className="pb-spacer" />

                        {countdown === null ? (
                            <button
                                onClick={startCountdownAndCapture}
                                disabled={photos.length >= 4}
                                className="pb-shutter"
                                type="button"
                            >
                                <div className="pb-shutterInner" />
                            </button>
                        ) : (
                            <div className="pb-shutterBusy">
                                <div className="pb-spinner" />
                            </div>
                        )}

                        <div className="pb-counter">{photos.length}/4</div>
                    </div>
                </div>

                <canvas ref={canvasRef} className="pb-hidden" />
            </div>
        );
    }

    // 4) Result
    if (step === "result") {
        return (
            <div className="pb pb-result">
                <div className="pb-resultPanel">
                    <div className="pb-resultPanelTop">
                        <h3 className="pb-resultTitle">
                            <Palette size={18} className="pb-iconPurple" /> 選擇邊框顏色
                        </h3>
                        <span className="pb-smallMuted">點擊切換</span>
                    </div>

                    <div className="pb-colorRow">
                        {COLOR_PALETTE.map((color) => (
                            <button
                                key={color}
                                onClick={() => setCustomColor(color)}
                                className={`pb-colorDot ${customColor === color ? "is-selected" : ""}`}
                                style={{ backgroundColor: color }}
                                aria-label={`Select color ${color}`}
                                type="button"
                            />
                        ))}
                        <button onClick={() => setCustomColor("#ffffff")} className="pb-resetDot" type="button">
                            Reset
                        </button>
                    </div>
                </div>

                <canvas ref={resultCanvasRef} className="pb-hidden" />

                <div className="pb-stripWrap">
                    {downloadUrl ? (
                        <img src={downloadUrl} alt="Photo Strip" className="pb-stripImg" />
                    ) : (
                        <div className="pb-stripLoading">生成中...</div>
                    )}
                </div>

                <div className="pb-actions">
                    {downloadUrl && (
                        <a
                            href={downloadUrl}
                            download={`photobooth-${new Date().getTime()}.png`}
                            className="pb-downloadLink"
                        >
                            <Download size={18} /> 下載相片
                        </a>
                    )}

                    <button onClick={handleReset} className="pb-secondaryBtn" type="button">
                        <RefreshCw size={18} /> 再拍一次
                    </button>
                </div>
            </div>
        );
    }

    return null;
}
