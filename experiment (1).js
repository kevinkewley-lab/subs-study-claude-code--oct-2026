// experiment.js — jsPsych 8 session: consent → demographics → device/headphone checks →
// locked video → comprehension → recognition (2AFC) → meaning (MC) → vocabulary → survey.
// Edit content in config.js, not here.
(function () {
  const P = jsPsychModule.ParameterType;
  const C = CONFIG;
  const qs = new URLSearchParams(location.search);

  // ---------- condition + id ----------
  // Condition: fixed by ?cond=... in the link, otherwise assigned right after consent
  // (DataPipe rotation if C.DATAPIPE_ID is set, random if not or if DataPipe cannot be reached).
  let cond = C.CONDITIONS.includes(qs.get("cond")) ? qs.get("cond") : null;
  let assignment = cond ? "url" : null;
  const sessionTag = Date.now().toString(36);

  const jsPsych = initJsPsych({
    show_progress_bar: false,
    on_finish: () => {}
  });

  const t0 = Date.now();
  const bi = (en, zh) => `${en}<br><span class="zh">${zh}</span>`;

  // ---------- device snapshot (no hardware identification is possible for audio) ----------
  function deviceSnapshot() {
    const n = navigator;
    return {
      ua: n.userAgent,
      ua_platform: n.userAgentData ? n.userAgentData.platform : n.platform,
      ua_mobile: n.userAgentData ? n.userAgentData.mobile : null,
      max_touch_points: n.maxTouchPoints,
      screen_w: screen.width, screen_h: screen.height,
      inner_w: innerWidth, inner_h: innerHeight,
      dpr: window.devicePixelRatio,
      orientation: (screen.orientation && screen.orientation.type) || (innerWidth > innerHeight ? "landscape" : "portrait"),
      lang: n.language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      standalone: !!n.standalone,
      fullscreen_enabled: !!(document.fullscreenEnabled || document.webkitFullscreenEnabled)
    };
  }
  jsPsych.data.addProperties({ study: C.STUDY_ID, cond: cond, assignment_method: assignment, pid: qs.get("id") || null });

  // ======================================================================
  // Plugin 1: audio-choice — play clip(s) on tap, then choose an option.
  // Used for 2AFC recognition (clips A and B) and for meaning (one clip).
  // ======================================================================
  class AudioChoicePlugin {
    static info = {
      name: "audio-choice", version: "1.0.0",
      parameters: {
        prompt:  { type: P.HTML_STRING, default: "" },
        clips:   { type: P.OBJECT, default: undefined },   // [{label, src}]
        options: { type: P.OBJECT, default: undefined },   // [{label, value}]
        require_all_played: { type: P.BOOL, default: true }
      },
      data: {}
    };
    constructor(jsPsych) { this.jsPsych = jsPsych; }
    trial(el, t) {
      const start = performance.now();
      const clips = t.clips.map(c => { const a = new Audio(); a.preload = "auto"; a.src = c.src; return a; });
      const plays = t.clips.map(() => 0), ended = t.clips.map(() => false);
      const log = []; let audioError = false, enabledAt = null;
      el.innerHTML = `
        <div class="prompt">${t.prompt}</div>
        <div class="clips">${t.clips.map((c, i) => `<button class="jspsych-btn clipbtn" data-i="${i}">▶ ${c.label}</button>`).join("")}</div>
        <div class="hint" id="ac-hint"></div>
        <div class="opts">${t.options.map((o, i) => `<button class="jspsych-btn optbtn" data-i="${i}" disabled>${o.label}</button>`).join("")}</div>
        <div class="trouble"><button class="linkbtn" id="ac-problem">${bi("I could not hear / play the sound", "我聽不到 / 無法播放")}</button></div>`;
      const optBtns = [...el.querySelectorAll(".optbtn")];
      const hint = el.querySelector("#ac-hint");
      const maybeEnable = () => {
        if (!t.require_all_played || ended.every(Boolean)) {
          if (enabledAt === null) enabledAt = performance.now();
          optBtns.forEach(b => (b.disabled = false)); hint.textContent = "";
        } else {
          hint.innerHTML = bi("Play every sound first.", "請先播放所有聲音。");
        }
      };
      clips.forEach((a, i) => {
        a.addEventListener("ended", () => { ended[i] = true; plays[i]++; maybeEnable(); });
        a.addEventListener("error", () => { audioError = true; log.push({ t: performance.now() - start, ev: "audio_error", i }); });
      });
      el.querySelectorAll(".clipbtn").forEach(b => b.addEventListener("click", () => {
        const i = +b.dataset.i;
        clips.forEach(a => { a.pause(); });
        clips[i].currentTime = 0;
        log.push({ t: performance.now() - start, ev: "play_click", i });
        clips[i].play().catch(e => log.push({ t: performance.now() - start, ev: "play_rejected", i, msg: String(e) }));
      }));
      const done = (idx, problem) => {
        clips.forEach(a => a.pause());
        this.jsPsych.finishTrial({
          choice_index: idx,
          choice_label: idx === null ? null : t.options[idx].label,
          choice_value: idx === null ? null : t.options[idx].value,
          rt_total_ms: Math.round(performance.now() - start),
          rt_after_enabled_ms: enabledAt === null ? null : Math.round(performance.now() - enabledAt),
          play_counts: plays, audio_error: audioError, reported_audio_problem: !!problem,
          option_order: t.options.map(o => o.value), clip_order: t.clips.map(c => c.label),
          log: log
        });
      };
      optBtns.forEach(b => b.addEventListener("click", () => done(+b.dataset.i, false)));
      el.querySelector("#ac-problem").addEventListener("click", () => done(null, true));
    }
  }

  // ======================================================================
  // Plugin 2: headphone-trial — antiphase check (after Woods et al., 2017).
  // Three 200 Hz tones: normal, -6 dB (the target to choose), and one in antiphase.
  // Over headphones the antiphase tone sounds normal; over speakers/mono mix it cancels
  // and sounds quiet, so speaker users pick the wrong one.
  // ======================================================================
  let actx = null;
  function tone(ctx, kind) {
    const sr = ctx.sampleRate, n = Math.floor(sr * 1.0), ramp = Math.floor(sr * 0.02);
    const b = ctx.createBuffer(2, n, sr), L = b.getChannelData(0), R = b.getChannelData(1);
    const amp = kind === "quiet" ? 0.25 : 0.5;
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / ramp, (n - i) / ramp);
      const s = Math.sin(2 * Math.PI * 200 * i / sr) * amp * env;
      L[i] = s; R[i] = kind === "anti" ? -s : s;
    }
    return b;
  }
  class HeadphoneTrialPlugin {
    static info = {
      name: "headphone-trial", version: "1.0.0",
      parameters: { prompt: { type: P.HTML_STRING, default: "" } }, data: {}
    };
    constructor(jsPsych) { this.jsPsych = jsPsych; }
    trial(el, t) {
      const order = jsPsych.randomization.shuffle(["normal", "quiet", "anti"]);
      const correct = order.indexOf("quiet");
      el.innerHTML = `<div class="prompt">${t.prompt}</div>
        <div id="hp-status" class="hint">&nbsp;</div>
        <button class="jspsych-btn" id="hp-play">▶ ${bi("Play", "播放")}</button>
        <div id="hp-choices" style="display:none">
          <p>${bi("Which sound was the QUIETEST?", "哪一個聲音最小聲？")}</p>
          ${[1, 2, 3].map(i => `<button class="jspsych-btn optbtn" data-i="${i - 1}">${i}</button>`).join("")}
        </div>`;
      const status = el.querySelector("#hp-status"), start = performance.now();
      el.querySelector("#hp-play").addEventListener("click", ev => {
        ev.target.disabled = true;
        actx = actx || new (window.AudioContext || window.webkitAudioContext)();
        actx.resume();
        const t0 = actx.currentTime + 0.15;
        order.forEach((k, i) => {
          const src = actx.createBufferSource(); src.buffer = tone(actx, k);
          src.connect(actx.destination); src.start(t0 + i * 1.5);
          setTimeout(() => { status.textContent = `${i + 1}`; }, 150 + i * 1500);
        });
        setTimeout(() => {
          status.innerHTML = "&nbsp;";
          el.querySelector("#hp-play").style.display = "none";
          el.querySelector("#hp-choices").style.display = "block";
        }, 150 + 3 * 1500);
      });
      el.querySelectorAll(".optbtn").forEach(b => b.addEventListener("click", () => {
        const idx = +b.dataset.i;
        this.jsPsych.finishTrial({
          order: order, correct_index: correct, choice_index: idx,
          correct: idx === correct, rt_ms: Math.round(performance.now() - start)
        });
      }));
    }
  }

  // ======================================================================
  // Plugin 3: video-lock — no native controls, seeks reverted and logged, events logged.
  // Fullscreen: div fullscreen where supported; native video fullscreen on iPhone
  // (iOS always shows its own controls there, so seeks can happen — they are logged and flagged).
  // ======================================================================
  class VideoLockPlugin {
    static info = {
      name: "video-lock", version: "1.0.0",
      parameters: {
        src: { type: P.STRING, default: undefined },
        min_fraction: { type: P.FLOAT, default: 0.95 }
      }, data: {}
    };
    constructor(jsPsych) { this.jsPsych = jsPsych; }
    trial(el, t) {
      const T0 = performance.now(); const ev = [];
      const logEv = (type, extra) => ev.push(Object.assign({ t: Math.round(performance.now() - T0), type, ct: +(v.currentTime || 0).toFixed(2) }, extra || {}));
      el.innerHTML = `
        <div id="vwrap">
          <video id="vid" playsinline webkit-playsinline preload="auto" disablepictureinpicture
                 controlslist="nodownload noplaybackrate" src="${t.src}"></video>
          <div id="voverlay">
            <button class="jspsych-btn" id="vplay">▶ ${bi("Play (full screen)", "播放（全螢幕）")}</button>
          </div>
        </div>
        <div id="vdone" style="display:none">
          <p>${bi("The video has finished.", "影片已播放完畢。")}</p>
          <button class="jspsych-btn" id="vcontinue">${bi("Continue", "繼續")}</button>
        </div>
        <div id="verr" class="hint" style="display:none"></div>`;
      const v = el.querySelector("#vid"), wrap = el.querySelector("#vwrap"),
            overlay = el.querySelector("#voverlay"), playBtn = el.querySelector("#vplay");
      let lastGood = 0, snapping = false, seeked = false, nPause = 0, nFsExit = 0, nBlur = 0,
          hiddenMs = 0, hiddenAt = null, started = false, finished = false, firstPlayAt = null;
      let startInfo = null;

      const enterFs = () => {
        try {
          if (wrap.requestFullscreen) {
            // The videos are portrait (1080x1920), so do not force landscape.
            wrap.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
          } else if (wrap.webkitRequestFullscreen) { wrap.webkitRequestFullscreen(); }
          else if (v.webkitEnterFullscreen) { v.webkitEnterFullscreen(); }
        } catch (e) { logEv("fs_error", { msg: String(e) }); }
      };
      const exitFs = () => {
        try {
          if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
          else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
          else if (v.webkitExitFullscreen && v.webkitDisplayingFullscreen) v.webkitExitFullscreen();
        } catch (e) {}
      };
      const startPlay = () => {
        overlay.style.display = "none";
        enterFs();
        if (!started) {
          started = true; firstPlayAt = Math.round(performance.now() - T0);
          startInfo = Object.assign(deviceSnapshot(), { video_client_w: v.clientWidth, video_client_h: v.clientHeight, video_w: v.videoWidth, video_h: v.videoHeight });
        }
        v.play().catch(e => { logEv("play_rejected", { msg: String(e) }); overlay.style.display = "flex"; });
      };
      playBtn.addEventListener("click", () => {
        playBtn.innerHTML = `▶ ${bi("Resume", "繼續播放")}`; startPlay();
      });

      v.addEventListener("loadedmetadata", () => logEv("loadedmetadata", { duration: v.duration }));
      v.addEventListener("play", () => logEv("play"));
      v.addEventListener("playing", () => logEv("playing"));
      v.addEventListener("pause", () => {
        logEv("pause");
        if (!v.ended && !finished) { nPause++; overlay.style.display = "flex"; }
      });
      v.addEventListener("waiting", () => logEv("waiting"));
      v.addEventListener("volumechange", () => logEv("volumechange", { vol: v.volume, muted: v.muted }));
      v.addEventListener("ratechange", () => { logEv("ratechange", { rate: v.playbackRate }); if (v.playbackRate !== 1) v.playbackRate = 1; });
      v.addEventListener("timeupdate", () => { if (!v.seeking && v.currentTime >= lastGood && v.currentTime - lastGood < 2) lastGood = v.currentTime; });
      v.addEventListener("seeking", () => {
        if (snapping) return;
        if (Math.abs(v.currentTime - lastGood) > 0.5) {
          seeked = true; logEv("seeking", { from: +lastGood.toFixed(2) });
          snapping = true; v.currentTime = lastGood;
        }
      });
      v.addEventListener("seeked", () => { logEv("seeked"); snapping = false; });
      v.addEventListener("error", () => {
        logEv("error", { code: v.error && v.error.code });
        const m = el.querySelector("#verr"); m.style.display = "block";
        m.innerHTML = bi("The video could not be loaded. Please tell the researcher.", "影片無法載入，請告知研究人員。");
      });
      v.addEventListener("webkitbeginfullscreen", () => logEv("fs_enter_native"));
      v.addEventListener("webkitendfullscreen", () => { logEv("fs_exit_native"); if (!v.ended) { nFsExit++; v.pause(); } });
      const onFs = () => {
        const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
        logEv(on ? "fs_enter" : "fs_exit");
        if (!on && started && !finished) { nFsExit++; v.pause(); }
      };
      document.addEventListener("fullscreenchange", onFs);
      document.addEventListener("webkitfullscreenchange", onFs);
      const onVis = () => {
        logEv(document.hidden ? "tab_hidden" : "tab_visible");
        if (document.hidden && started && !finished) { hiddenAt = performance.now(); }
        else if (hiddenAt !== null) { hiddenMs += performance.now() - hiddenAt; hiddenAt = null; }
      };
      const onBlur = () => { if (started && !finished) { nBlur++; logEv("window_blur"); } };
      const onFocus = () => logEv("window_focus");
      const onResize = () => logEv("resize", { w: innerWidth, h: innerHeight });
      document.addEventListener("visibilitychange", onVis);
      window.addEventListener("blur", onBlur); window.addEventListener("focus", onFocus);
      window.addEventListener("resize", onResize); window.addEventListener("orientationchange", onResize);

      v.addEventListener("ended", () => {
        finished = true; logEv("ended");
        el.querySelector("#vwrap").style.display = "none";
        exitFs();
        el.querySelector("#vdone").style.display = "block";
      });

      el.querySelector("#vcontinue").addEventListener("click", () => {
        let watched = 0;
        for (let i = 0; i < v.played.length; i++) watched += v.played.end(i) - v.played.start(i);
        const dur = v.duration || null;
        const frac = dur ? watched / dur : null;
        document.removeEventListener("fullscreenchange", onFs);
        document.removeEventListener("webkitfullscreenchange", onFs);
        document.removeEventListener("visibilitychange", onVis);
        window.removeEventListener("blur", onBlur); window.removeEventListener("focus", onFocus);
        window.removeEventListener("resize", onResize); window.removeEventListener("orientationchange", onResize);
        this.jsPsych.finishTrial({
          src: t.src, duration: dur, watched_sec: +watched.toFixed(2), watched_fraction: frac === null ? null : +frac.toFixed(4),
          seeked: seeked, n_pauses: nPause, n_fullscreen_exits: nFsExit, n_window_blur: nBlur,
          hidden_sec: +(hiddenMs / 1000).toFixed(2), ended: !!v.ended,
          meets_watch_criterion: !!(v.ended && !seeked && frac !== null && frac >= t.min_fraction),
          first_play_ms: firstPlayAt, start_device: startInfo, events: ev
        });
      });
    }
  }

  // ---------- helpers to build trials ----------
  const trialCount = C.COMPREHENSION.length + 1 + C.RECOG_ITEMS.length + C.MEANING_ITEMS.length + C.VOCAB_ITEMS.length;
  const btn = (stimulus, choices, data, extra) =>
    Object.assign({ type: jsPsychHtmlButtonResponse, stimulus: stimulus, choices: choices, data: data || {} }, extra || {});

  const CONF_CHOICES = ["Guess 猜的", "Unsure 不太確定", "Sure 很確定"];
  const confTrial = (data) => btn(`<p>${bi("How sure are you?", "你有多確定？")}</p>`, CONF_CHOICES,
    Object.assign({ phase: "confidence" }, data), { on_finish: d => { d.confidence = ["guess", "unsure", "sure"][d.response]; } });

  function recogTrials(item, isPractice) {
    const slot = Math.random() < 0.5 ? "A" : "B";
    const clips = slot === "A"
      ? [{ label: "A", src: item.target }, { label: "B", src: item.foil }]
      : [{ label: "A", src: item.foil }, { label: "B", src: item.target }];
    const base = { item_id: item.id, word_type: item.type, word: item.word || null, foil_word: item.foil_word || null, target_slot: slot, practice: !!isPractice };
    return [
      { type: AudioChoicePlugin, prompt: bi("Which word was spoken in the video — A or B?<br>Tap ▶ to hear both, then choose.", "哪一個字出現在影片中？A 還是 B？<br>請先按 ▶ 聽兩個聲音，再選擇。"),
        clips: clips, options: [{ label: "A", value: "A" }, { label: "B", value: "B" }],
        data: Object.assign({ phase: "recognition" }, base),
        on_finish: d => { d.correct = d.choice_value === slot; } },
      confTrial(Object.assign({ phase: "recognition_confidence" }, base))
    ];
  }
  function meaningTrials(item, isPractice) {
    const opts = jsPsych.randomization.shuffle([{ label: item.correct, value: "correct" }]
      .concat(item.distractors.map(d => ({ label: d.t, value: d.src }))));
    const base = { item_id: item.id, word_type: item.type, word: item.word || null, practice: !!isPractice };
    return [
      { type: AudioChoicePlugin, prompt: bi("Listen to the word from the video. Which definition below is closest to its meaning?", "聽聽影片裡的這個詞。下面哪個定義與它的含義最接近？"),
        clips: [{ label: "Play 播放", src: item.clip }], options: opts,
        data: Object.assign({ phase: "meaning" }, base),
        on_finish: d => { d.correct = d.choice_value === "correct"; d.correct_position = opts.findIndex(o => o.value === "correct"); } },
      confTrial(Object.assign({ phase: "meaning_confidence" }, base))
    ];
  }

  // ======================================================================
  // Plugin 4: assign-condition — runs after consent so people who decline do not use up a slot.
  // ======================================================================
  class AssignConditionPlugin {
    static info = { name: "assign-condition", version: "1.0.0", parameters: {}, data: {} };
    constructor(jsPsych) { this.jsPsych = jsPsych; }
    trial(el) {
      el.innerHTML = `<p class="hint">${bi("Loading…", "載入中……")}</p>`;
      (async () => {
        if (!cond) {
          cond = C.CONDITIONS[Math.floor(Math.random() * C.CONDITIONS.length)]; assignment = "random";
          if (C.DATAPIPE_ID && window.jsPsychPipe) {
            try {
              const idx = await Promise.race([
                jsPsychPipe.getCondition(C.DATAPIPE_ID),
                new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 6000))
              ]);
              if (Number.isInteger(idx)) { cond = C.CONDITIONS[((idx % C.CONDITIONS.length) + C.CONDITIONS.length) % C.CONDITIONS.length]; assignment = "datapipe"; }
              else assignment = "random_fallback";
            } catch (err) { assignment = "random_fallback"; }
          }
        }
        jsPsych.data.addProperties({ cond: cond, assignment_method: assignment });
        this.jsPsych.finishTrial({ cond: cond, assignment_method: assignment });
      })();
    }
  }

  // ---------- timeline ----------
  const tl = [];

  // 1 consent
  tl.push(btn(`<div class="textblock">${C.CONSENT_HTML}</div>`, [C.CONSENT_AGREE, C.CONSENT_DECLINE], { phase: "consent" }, {
    on_finish: d => { d.consent = d.response === 0; if (d.response !== 0) jsPsych.abortExperiment(`<p>${bi("Thank you. The session has ended.", "謝謝你，測驗已結束。")}</p>`); }
  }));

  // 1b condition assignment (after consent)
  tl.push({ type: AssignConditionPlugin, data: { phase: "assign_condition" } });

  // 2 demographics
  tl.push({
    type: jsPsychSurveyHtmlForm, preload: false,
    html: `<div class="form">
      <p><label>${bi("ID number", "學號 / 編號")}<br><input name="pid" type="text" required value="${(qs.get("id") || "").replace(/[^\w-]/g, "")}"></label></p>
      <p><label>${bi("Age", "年齡")}<br><input name="age" type="number" min="18" max="99" required></label></p>
      <p>${bi("Sex", "性別")}<br>
        <label><input type="radio" name="sex" value="male" required> 男 Male</label>
        <label><input type="radio" name="sex" value="female"> 女 Female</label>
        <label><input type="radio" name="sex" value="other"> 其他 Other</label>
        <label><input type="radio" name="sex" value="na"> 不願透露 Prefer not to say</label></p>
      <p>${bi("Is Mandarin your first language?", "華語（國語）是你的第一語言嗎？")}<br>
        <label><input type="radio" name="l1_mandarin" value="yes" required> 是 Yes</label>
        <label><input type="radio" name="l1_mandarin" value="no"> 否 No</label></p>
      <p><label>${bi("Most recent English test and score (if any)", "最近一次英語檢定與分數（若有）")}<br><input name="english_test" type="text"></label></p>
      <p>${bi("Have you seen this video before?", "你以前看過這段影片嗎？")}<br>
        <label><input type="radio" name="seen_before" value="yes" required> 是 Yes</label>
        <label><input type="radio" name="seen_before" value="no"> 否 No</label></p>
    </div>`,
    button_label: "Next 下一步", data: { phase: "demographics" },
    on_finish: d => { jsPsych.data.addProperties({ pid: d.response.pid }); }
  });

  // 3 instructions + device checklist
  tl.push(btn(`<div class="textblock">
      <p>${bi(`You will watch a short English video (about 1 minute). After it, you will answer about ${trialCount} questions about the video and some of its words.`,
               `你將觀看一段約 1 分鐘的英語短片，之後會回答約 ${trialCount} 個關於影片內容和部分字詞的問題。`)}</p>
      <p>${bi("Before you start: use your own phone; wear earbuds or headphones; turn on Do Not Disturb; stay on this page until the end.",
               "開始前：請使用你自己的手機；戴上耳機或耳塞；開啟「勿擾模式」；測驗期間請停留在此頁面。")}</p>
      <p>${bi("Set your volume to a comfortable level now. Do not change it during the test.", "請現在把音量調到舒適的大小，測驗期間不要再調整。")}</p></div>`,
    ["Start 開始"], { phase: "instructions" }));

  tl.push(btn(`<p>${bi("What are you listening with?", "你現在使用什麼收聽？")}</p>`,
    ["Over-ear headphones 頭戴式耳機", "Earbuds / in-ear 耳塞式耳機", "Laptop or phone speakers 筆電或手機喇叭", "Other 其他"],
    { phase: "audio_device" }, { on_finish: d => { d.audio_device = ["over_ear", "earbuds", "speakers", "other"][d.response]; } }));

  // 4 headphone check
  const hpTrials = [];
  for (let i = 0; i < C.HEADPHONE_TRIALS; i++) {
    hpTrials.push({ type: HeadphoneTrialPlugin, prompt: bi(`Sound check ${i + 1} of ${C.HEADPHONE_TRIALS}. Tap Play; you will hear three sounds.`, `聲音檢查 ${i + 1} / ${C.HEADPHONE_TRIALS}。按播放，你會聽到三個聲音。`),
      data: { phase: "headphone_check", hp_trial: i + 1 } });
  }
  tl.push(btn(`<div class="textblock"><p>${bi("First, a short sound check (about 1 minute). Please use your earbuds or headphones.", "首先進行簡短的聲音檢查（約 1 分鐘）。請戴上耳機或耳塞。")}</p></div>`, ["Continue 繼續"], { phase: "headphone_intro" }));
  tl.push(...hpTrials);
  tl.push({
    type: jsPsychHtmlButtonResponse, choices: ["Continue 繼續"], data: { phase: "headphone_result" },
    stimulus: () => {
      const n = jsPsych.data.get().filter({ phase: "headphone_check" }).select("correct").values.filter(Boolean).length;
      jsPsych.data.addProperties({ headphone_score: n, headphone_pass: n >= C.HEADPHONE_PASS });
      return `<p>${bi("Sound check complete.", "聲音檢查完成。")}</p>`;
    },
    on_finish: d => {
      const n = jsPsych.data.get().filter({ phase: "headphone_check" }).select("correct").values.filter(Boolean).length;
      d.headphone_score = n; d.headphone_pass = n >= C.HEADPHONE_PASS;
      if (!d.headphone_pass && C.HEADPHONE_FAIL_ACTION === "end")
        jsPsych.abortExperiment(`<p>${bi("Sorry — the sound check was not passed, so the session ends here. Thank you.", "抱歉，聲音檢查未通過，測驗到此結束。謝謝你。")}</p>`);
    }
  });

  // 5 video
  tl.push(btn(`<div class="textblock">
      <p>${bi("Now watch the video from start to finish. Tap Play; it will go full screen. Please do not pause or skip, and keep earbuds in.",
               "現在請從頭到尾觀看影片。按播放後會進入全螢幕。請不要暫停或快轉，並持續戴著耳塞。")}</p>
      <p>${bi("You will not be able to go back.", "影片無法重看。")}</p></div>`, ["Ready 準備好了"], { phase: "video_intro" }));
  tl.push({
    type: VideoLockPlugin, src: () => C.VIDEOS[cond], min_fraction: C.MIN_WATCH_FRACTION, data: { phase: "video" },
    on_finish: d => { saveAll(false); }
  });

  // 6 comprehension + difficulty
  C.COMPREHENSION.forEach(q => {
    // q.shuffle: true randomises the option order (multiple choice); yes/no items keep their order.
    const perm = q.shuffle ? jsPsych.randomization.shuffle(q.choices.map((_, i) => i)) : q.choices.map((_, i) => i);
    tl.push(btn(`<p>${q.q}</p>`, perm.map(i => q.choices[i]), { phase: "comprehension", item_id: q.id },
      { on_finish: d => { d.choice_original_index = perm[d.response]; d.correct = perm[d.response] === q.answer; } }));
  });
  tl.push(btn(`<p>${bi("How much of the video did you understand?", "你理解了影片多少內容？")}</p>
      <p class="hint">${bi("1 = almost nothing, 6 = everything", "1 = 幾乎不懂，6 = 全部理解")}</p>`,
    ["1", "2", "3", "4", "5", "6"], { phase: "difficulty" }, { on_finish: d => { d.difficulty = d.response + 1; } }));

  // 7 recognition
  tl.push(btn(`<div class="textblock"><p>${bi("Next: some words. For each question you will hear two sounds, A and B. Choose the one that was spoken in the video. Try one practice first.",
    "接下來是字詞。每題會聽到 A、B 兩個聲音，請選出影片中出現的那一個。先做一題練習。")}</p></div>`, ["Continue 繼續"], { phase: "recog_intro" }));
  C.RECOG_PRACTICE.forEach(it => tl.push(...recogTrials(it, true)));
  jsPsych.randomization.shuffle(C.RECOG_ITEMS).forEach(it => tl.push(...recogTrials(it, false)));

  // 8 meaning
  tl.push(btn(`<div class="textblock"><p>${bi("Now you will hear one word from the video. Choose the Chinese meaning that fits best. Try one practice first.",
    "現在你會聽到影片中的一個字，請選出最符合的中文意思。先做一題練習。")}</p></div>`, ["Continue 繼續"], { phase: "meaning_intro" }));
  C.MEANING_PRACTICE.forEach(it => tl.push(...meaningTrials(it, true)));
  jsPsych.randomization.shuffle(C.MEANING_ITEMS).forEach(it => tl.push(...meaningTrials(it, false)));

  // 9 vocabulary (optional)
  if (C.VOCAB_ITEMS.length) {
    tl.push(btn(`<div class="textblock"><p>${bi("Last part: choose the best meaning for each word.", "最後一部分：為每個字選出最適合的意思。")}</p></div>`, ["Start 開始"], { phase: "vocab_intro" }));
    C.VOCAB_ITEMS.forEach(it => tl.push(btn(`<p class="stem">${it.stem}</p>`, it.options,
      { phase: "vocab", item_id: it.id, band: it.band }, { on_finish: d => { d.correct = d.response === it.answer; } })));
  }

  // 10 own-device checks + habits survey
  tl.push({
    type: jsPsychSurveyHtmlForm, preload: false, button_label: "Finish 完成", data: { phase: "survey" },
    html: `<div class="form">
      <p>${bi("Did you look anything up, translate, or take notes during the test?", "測驗期間你有查詢、翻譯或做筆記嗎？")}<br>
        <label><input type="radio" name="looked_up" value="no" required> 沒有 No</label>
        <label><input type="radio" name="looked_up" value="yes"> 有 Yes</label></p>
      <p>${bi("Did you wear earbuds or headphones the whole time?", "你全程都戴著耳機或耳塞嗎？")}<br>
        <label><input type="radio" name="earbuds_throughout" value="yes" required> 是 Yes</label>
        <label><input type="radio" name="earbuds_throughout" value="no"> 否 No</label></p>
      <p>${bi("When you watch English videos, which subtitles do you usually use?", "看英語影片時，你通常使用哪種字幕？")}<br>
        <label><input type="radio" name="habit_subtitles" value="chinese" required> 中文字幕</label>
        <label><input type="radio" name="habit_subtitles" value="english"> 英文字幕</label>
        <label><input type="radio" name="habit_subtitles" value="none"> 沒有字幕</label>
        <label><input type="radio" name="habit_subtitles" value="depends"> 視情況而定</label></p>
      <p>${bi("About how many hours a week do you watch short videos?", "你每週大約看幾小時的短影片？")}<br>
        <label><input type="radio" name="habit_hours" value="lt1" required> &lt;1</label>
        <label><input type="radio" name="habit_hours" value="1-3"> 1–3</label>
        <label><input type="radio" name="habit_hours" value="3-7"> 3–7</label>
        <label><input type="radio" name="habit_hours" value="7-14"> 7–14</label>
        <label><input type="radio" name="habit_hours" value="gt14"> &gt;14</label></p>
      <p>${bi("What device do you usually watch short videos on?", "你通常用什麼裝置看短影片？")}<br>
        <label><input type="radio" name="habit_device" value="phone" required> 手機</label>
        <label><input type="radio" name="habit_device" value="tablet"> 平板</label>
        <label><input type="radio" name="habit_device" value="laptop"> 筆電 / 電腦</label>
        <label><input type="radio" name="habit_device" value="tv"> 電視</label></p>
      <p>${bi("Where do you usually watch?", "你通常在哪裡看？")}<br>
        <label><input type="radio" name="habit_where" value="home" required> 家裡</label>
        <label><input type="radio" name="habit_where" value="commute"> 通勤 / 路上</label>
        <label><input type="radio" name="habit_where" value="school"> 學校</label>
        <label><input type="radio" name="habit_where" value="other"> 其他</label></p>
    </div>`
  });

  // 11 end
  tl.push({
    type: jsPsychHtmlButtonResponse, choices: ["Download backup 下載備份"], data: { phase: "end" },
    stimulus: () => `<div class="textblock"><p id="savemsg">${bi("Saving your answers…", "正在儲存你的答案……")}</p>
      <p>${bi("Thank you for taking part!", "感謝你的參與！")}</p></div>`,
    on_load: () => {
      saveAll(true).then(ok => {
        const m = document.getElementById("savemsg");
        if (m) m.innerHTML = ok ? bi("Your answers are saved.", "你的答案已儲存。") : bi("Saved on this device only — please download the backup and send it to the researcher.", "答案僅儲存在此裝置——請下載備份並交給研究人員。");
      });
    },
    on_finish: () => { downloadBackup(); }
  });

  // ---------- saving ----------
  function payload(isFinal) {
    const rows = jsPsych.data.get().values();
    const vid = rows.find(r => r.phase === "video");
    return {
      study: C.STUDY_ID, cond: cond, final: isFinal, saved_at: new Date().toISOString(),
      session_ms: Date.now() - t0, device_end: deviceSnapshot(),
      summary: vid ? { meets_watch_criterion: vid.meets_watch_criterion, watched_fraction: vid.watched_fraction, seeked: vid.seeked } : null,
      trials: rows, interaction: jsPsych.data.getInteractionData().values()
    };
  }
  async function saveAll(isFinal) {
    let ok = false;
    if (C.DATAPIPE_ID && window.jsPsychPipe) {
      const pid = String(jsPsych.data.dataProperties.pid || "unknown").replace(/[^\w-]/g, "");
      const base = `${pid}_${cond}_${sessionTag}`;
      try {
        if (!isFinal) {
          const r = await jsPsychPipe.saveData(C.DATAPIPE_ID, base + "_partial.json", JSON.stringify(payload(false)));
          ok = !(r && r.error);
        } else {
          const r1 = await jsPsychPipe.saveData(C.DATAPIPE_ID, base + "_trials.csv", jsPsych.data.get().csv());
          const r2 = await jsPsychPipe.saveData(C.DATAPIPE_ID, base + "_full.json", JSON.stringify(payload(true)));
          ok = !(r1 && r1.error) && !(r2 && r2.error);
        }
      } catch (err) { ok = false; }
    }
    if (!ok && C.SAVE_URL) {
      // Google Apps Script (or any endpoint): one POST with the CSV and the JSON. The reply cannot be read
      // across origins (mode "no-cors"), so a completed request is treated as sent; the backup download is the safety net.
      try {
        const pid = String(jsPsych.data.dataProperties.pid || "unknown").replace(/[^\w-]/g, "");
        await fetch(C.SAVE_URL, {
          method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            secret: C.SAVE_SECRET || "", base: `${pid}_${cond}_${sessionTag}`, final: isFinal,
            csv: isFinal ? jsPsych.data.get().csv() : null, json: JSON.stringify(payload(isFinal))
          })
        });
        ok = true;
      } catch (err) { ok = false; }
    }
    return ok;
  }
  function downloadBackup() {
    const blob = new Blob([JSON.stringify(payload(true), null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `${C.STUDY_ID}_${cond}_${(jsPsych.data.dataProperties.pid || "unknown")}.json`;
    document.body.appendChild(a); a.click(); a.remove();
  }
  window.__jsPsych = jsPsych; // for debugging in the console

  jsPsych.run(tl);
})();
