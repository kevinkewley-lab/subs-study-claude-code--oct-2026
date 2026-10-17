// ===================================================================
// CONFIG — edit this file only. experiment.js reads everything from here.
// All participant-facing text that is not here is bilingual EN / 繁體中文 in experiment.js
// (have a native speaker check the Chinese wording before piloting).
// ===================================================================
const CONFIG = {
  STUDY_ID: "subtitle_study_v2",

  // POST endpoint that receives the JSON payload (e.g. a Google Apps Script web app,
  // a JATOS/Firebase function, or your own server). Leave "" to disable.
  // The final screen always offers a "download backup" file as well.
  SAVE_URL: "",

  // Conditions. Assignment is random per participant unless the URL has ?cond=CHINESE
  // (use the URL parameter to run a balanced / blocked assignment from your own schedule).
  CONDITIONS: ["ENGLISH", "CHINESE", "NO_SUBS"],
  VIDEOS: {
    ENGLISH:  "media/video_ENGLISH.mp4",
    CHINESE:  "media/video_CHINESE.mp4",
    NO_SUBS:  "media/video_NO_SUBS.mp4"
  },

  // Pre-registered flag: seeked, or watched less than this fraction of the video.
  // The page only FLAGS (meets_watch_criterion); it does not remove anyone.
  MIN_WATCH_FRACTION: 0.95,

  // Headphone check: 6 trials, pass at >= HEADPHONE_PASS correct.
  // HEADPHONE_FAIL_ACTION: "flag" = continue and record headphone_pass=false; "end" = stop the session.
  HEADPHONE_TRIALS: 6,
  HEADPHONE_PASS: 5,
  HEADPHONE_FAIL_ACTION: "flag",

  // Consent text (from your ethics-approved form; wording kept as supplied).
  CONSENT_HTML: `
    <h3>Consent form 同意書</h3>
    <p><b>Study Title:</b> The Influence of Subtitles on Novel Words in short form video in L2 English<br>
       <b>Principal Investigator:</b> Kevin Kewley (Department of Speech Communication / English, Shih Hsin University)<br>
       <b>Contact:</b> <a href="mailto:kewley@mail.shu.edu.tw">kewley@mail.shu.edu.tw</a></p>

    <p><b>Purpose of the Study:</b><br>This study investigates how second language learners comprehend and process English multimedia content.</p>
    <p><b>研究目的：</b><br>本研究旨在探討第二語言學習者如何理解和處理英語多媒體內容。</p>

    <p><b>What You Will Do:</b><br>You will watch a short English video clip and answer follow-up questions related to the videos and language comprehension. The total session takes approximately 10–15 minutes.</p>
    <p><b>您將參與的活動：</b><br>您將觀看一段簡短的英語視頻，並回答與視頻內容及語言理解相關的問題。整個過程大約需要 10–15 分鐘。</p>

    <p><b>Voluntary Participation &amp; Anonymity:</b></p>
    <ul>
      <li>Your participation is entirely voluntary.</li>
      <li>You may discontinue the session at any point without penalty or any impact on your academic standing or course grades.</li>
      <li>The page records device details, screen size, playback events and tab switching, and asks about earbuds.</li>
      <li>All collected responses are strictly confidential, pseudonymised via participant ID numbers, and reported only in aggregate academic summaries.</li>
    </ul>
    <p><b>自願參與與匿名性：</b></p>
    <ul>
      <li>您的參與完全出於自願。</li>
      <li>您可以隨時終止參與，且不會因此受到任何懲罰，也不會影響您的學籍狀況或課程成績。</li>
      <li>此頁面會記錄裝置詳情、螢幕尺寸、播放事件及標籤頁切換情況，並詢問有關耳機的資訊。</li>
      <li>所有收集到的回應均嚴格保密；透過參與者編號進行去識別化處理，且僅以匯總後的學術摘要形式呈現。</li>
    </ul>
    <p><b>Do you agree to take part in this study?</b></p>`,
  CONSENT_AGREE:   "I am at least 18 years old, understand the terms, and agree to participate. 我已年滿18歲，了解相關條款，並同意參與。",
  CONSENT_DECLINE: "I do not wish to participate. 我不願參與。",

  // Comprehension questions (shown after the video). Add 1–2 more with real content;
  // two yes/no items have a 50% guess rate. 'answer' is the correct choice index.
  COMPREHENSION: [
    { id: "comp1", q: "Did Elon follow his dream?<br>Elon 有追求他的夢想嗎？", choices: ["Yes 有", "No 沒有"], answer: 0 },
    { id: "comp2", q: "Did Elon succeed in his dream?<br>Elon 實現了他的夢想嗎？", choices: ["Yes 有", "No 沒有"], answer: 0 },
    // DRAFT multiple-choice items: check every option against the video before piloting.
    // Options are in Chinese so the question tests the video, not English reading. No option may
    // contain a tested word or its meaning (Mars, plans, engineer, space, rocket, mice, pod, plants).
    { id: "comp3", shuffle: true, q: "When did Elon first have his dream?<br>Elon 是什麼時候第一次有這個夢想的？",
      choices: ["他還是孩子的時候", "他上大學的時候", "他開始工作的時候", "他搬到洛杉磯的時候"], answer: 0 },
    { id: "comp4", shuffle: true, q: "Why did Elon go to LA?<br>Elon 為什麼去洛杉磯？",
      choices: ["因為他對在那裡工作有興趣", "為了念大學", "為了探望家人", "為了參加比賽"], answer: 0 },
    { id: "comp5", shuffle: true, q: "How much did Elon pay the society?<br>Elon 付了多少錢給協會？",
      choices: ["10萬美元", "1萬美元", "1千美元", "100萬美元"], answer: 0 }
  ],


  // ---- Recognition (form, 2AFC): the target and the foil are played as clips A and B ----
  // type: "pseudo" | "real". Which slot (A/B) holds the target is randomised per trial.
  RECOG_PRACTICE: [
    { id: "rp1", type: "practice", word: "child", foil_word: "bus", target: "audio/recog_practice_target.mp3", foil: "audio/recog_practice_foil.mp3" }
  ],
  RECOG_ITEMS: [
    // 'word' = the target (spoken in the video); 'foil_word' = the other clip (logged with every trial)
    { id: "r_vord",     type: "pseudo", word: "vord",     foil_word: "onk",     target: "audio/recog_pseudo1_target.mp3", foil: "audio/recog_pseudo1_foil.mp3" },
    { id: "r_ozrek",    type: "pseudo", word: "ozrek",    foil_word: "nuggy",   target: "audio/recog_pseudo2_target.mp3", foil: "audio/recog_pseudo2_foil.mp3" },
    { id: "r_florns",   type: "pseudo", word: "florns",   foil_word: "vulling", target: "audio/recog_pseudo3_target.mp3", foil: "audio/recog_pseudo3_foil.mp3" },
    { id: "r_nemvo",    type: "pseudo", word: "nemvo",    foil_word: "frask",   target: "audio/recog_pseudo4_target.mp3", foil: "audio/recog_pseudo4_foil.mp3" },
    { id: "r_Mars",     type: "real",   word: "Mars",     foil_word: "base",    target: "audio/recog_real1_target.mp3",   foil: "audio/recog_real1_foil.mp3" },
    { id: "r_plans",    type: "real",   word: "plans",    foil_word: "star",    target: "audio/recog_real2_target.mp3",   foil: "audio/recog_real2_foil.mp3" },
    { id: "r_engineer", type: "real",   word: "engineer", foil_word: "office",  target: "audio/recog_real3_target.mp3",   foil: "audio/recog_real3_foil.mp3" },
    { id: "r_space",    type: "real",   word: "space",    foil_word: "screen",  target: "audio/recog_real4_target.mp3",   foil: "audio/recog_real4_foil.mp3" }
  ],

  // ---- Meaning (4-option multiple choice, Traditional Chinese options) ----
  // 'correct' = the meaning (reworded, not the exact subtitle string).
  // distractors: { t: option text, src: "cross" (meaning of another item) | "filler" (depicted, not spoken) }.
  // The source is logged for every wrong answer. Option order is randomised per trial.
  // Source of truth: meaning_items_distractors.xlsx (Items + Balance sheets).
  MEANING_PRACTICE: [
    { id: "mp1", type: "practice", word: "child", clip: "audio/recog_practice_target.mp3", correct: "孩子",
      distractors: [{ t: "狗", src: "filler" }, { t: "汽車", src: "filler" }, { t: "外星人", src: "filler" }] }
  ],
  MEANING_ITEMS: [
    { id: "m_vord",     type: "pseudo", word: "vord",     clip: "audio/recog_pseudo1_target.mp3", correct: "實驗鼠",
      distractors: [{ t: "太空船", src: "cross" }, { t: "星星", src: "filler" }, { t: "工廠", src: "filler" }] },
    { id: "m_ozrek",    type: "pseudo", word: "ozrek",    clip: "audio/recog_pseudo2_target.mp3", correct: "太空船",
      distractors: [{ t: "作物", src: "cross" }, { t: "螢幕", src: "filler" }, { t: "小組", src: "filler" }] },
    { id: "m_florns",   type: "pseudo", word: "florns",   clip: "audio/recog_pseudo3_target.mp3", correct: "作物",
      distractors: [{ t: "太空艙", src: "cross" }, { t: "星星", src: "filler" }, { t: "想法", src: "filler" }] },
    { id: "m_nemvo",    type: "pseudo", word: "nemvo",    clip: "audio/recog_pseudo4_target.mp3", correct: "太空艙",
      distractors: [{ t: "實驗鼠", src: "cross" }, { t: "基地", src: "filler" }, { t: "專案", src: "filler" }] },
    { id: "m_Mars",     type: "real",   word: "Mars",     clip: "audio/recog_real1_target.mp3",   correct: "星球",
      distractors: [{ t: "宇宙", src: "cross" }, { t: "基地", src: "filler" }, { t: "小組", src: "filler" }] },
    { id: "m_plans",    type: "real",   word: "plans",    clip: "audio/recog_real2_target.mp3",   correct: "規劃",
      distractors: [{ t: "星球", src: "cross" }, { t: "辦公室", src: "filler" }, { t: "工廠", src: "filler" }] },
    { id: "m_engineer", type: "real",   word: "engineer", clip: "audio/recog_real3_target.mp3",   correct: "科學家",
      distractors: [{ t: "規劃", src: "cross" }, { t: "辦公室", src: "filler" }, { t: "專案", src: "filler" }] },
    { id: "m_space",    type: "real",   word: "space",    clip: "audio/recog_real4_target.mp3",   correct: "宇宙",
      distractors: [{ t: "科學家", src: "cross" }, { t: "螢幕", src: "filler" }, { t: "想法", src: "filler" }] }
  ],

  // Vocabulary test (Mandarin VST, Traditional adaptation). Leave [] to skip the block.
  // Each item: { id, band: "1k", stem: "time: They have a lot of time.", options: ["…","…","…","…"], answer: 0 }
  VOCAB_ITEMS: []
};
