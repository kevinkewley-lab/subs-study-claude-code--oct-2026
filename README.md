# Video + words study (jsPsych 8)

Files: `index.html` (page, loads jsPsych 8.3.0 from unpkg), `config.js` (all content), `experiment.js` (logic).
Put your media next to them:

    media/video_ENGLISH.mp4  media/video_CHINESE.mp4  media/video_NO_SUBS.mp4   (H.264 + AAC, faststart, subtitles burned in)
    audio/*.mp3              (file names as listed in config.js; same speaker, loudness-matched)

Host over HTTPS (GitHub Pages, Netlify, university server). Opening index.html from disk will not load the media reliably.

Link to give participants: `https://your.site/index.html` (random condition) or `...?cond=CHINESE&id=S001` to fix the condition / pre-fill the ID.

Saving: set `SAVE_URL` in config.js to an endpoint that accepts a POST (body = JSON text). The data are posted once right after the video
(partial) and once at the end (final). Each participant also gets a "download backup" JSON on the last screen.

Rows are in `payload.trials` (one per screen, `phase` column). Key fields:
- video: `watched_fraction`, `seeked`, `n_pauses`, `n_fullscreen_exits`, `hidden_sec`, `meets_watch_criterion`, `events[]`, `start_device`
- recognition: `target_slot`, `choice_value`, `correct`, `play_counts`, `rt_after_enabled_ms`; the next row (`recognition_confidence`) has `confidence`
- meaning: `option_order`, `correct_position`, `choice_index`, `correct`; the next row (`meaning_confidence`) has `confidence`
- headphone_result: `headphone_score`, `headphone_pass`; audio_device: self-reported device
- survey: habits (`habit_subtitles`, `habit_hours`, `habit_device`, `habit_where`), `looked_up`, `earbuds_throughout`

The page flags exclusions; it removes nobody. Apply your pre-registered rules in analysis.

Before piloting: fill in the placeholders in config.js (consent, items, audio files), have a native speaker check the Chinese text,
and test on a real iPhone (Safari) and a real Android phone (Chrome).
