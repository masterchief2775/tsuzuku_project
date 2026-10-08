import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeSkipCue,
  buildEpisodes,
  defaultSkipCues,
  episodeNumberLabel,
  findEpisode,
  formatClock,
  formatOffset,
  formatRemaining,
  hasWatched,
  nextEpisodeNumber,
  nextRate,
  nextVolume,
  percentFromDigit,
  previousEpisodeNumber,
  progressPercent,
  progressRatio,
  resumePosition,
  shortcutForKey,
  PLAYBACK_RATES,
  SIMULATED_EPISODE_SECONDS,
} from "./player.ts";

describe("formatClock", () => {
  it("drops the hour when there is none", () => {
    assert.equal(formatClock(0), "0:00");
    assert.equal(formatClock(9), "0:09");
    assert.equal(formatClock(754), "12:34");
    assert.equal(formatClock(3599), "59:59");
  });

  it("adds hours, zero-padded, only when needed", () => {
    assert.equal(formatClock(3600), "1:00:00");
    assert.equal(formatClock(3723), "1:02:03");
    assert.equal(formatClock(36000), "10:00:00");
  });

  it("survives nonsense input instead of printing NaN", () => {
    assert.equal(formatClock(-5), "0:00");
    assert.equal(formatClock(Number.NaN), "0:00");
    assert.equal(formatClock(Number.POSITIVE_INFINITY), "0:00");
  });
});

describe("formatOffset / formatRemaining", () => {
  it("signs the seek offset so the direction reads", () => {
    assert.equal(formatOffset(10), "+0:10");
    assert.equal(formatOffset(-10), "-0:10");
  });

  it("scales the remaining label to the size of the gap", () => {
    assert.equal(formatRemaining(0), "terminé");
    assert.equal(formatRemaining(-30), "terminé");
    assert.equal(formatRemaining(60), "−1 min");
    assert.equal(formatRemaining(3600), "−1 h");
    assert.equal(formatRemaining(5400), "−1 h 30 min");
  });
});

describe("volume and rate stepping", () => {
  it("steps volume and snaps to the ends", () => {
    assert.equal(nextVolume(0.5, 1), 0.6);
    assert.equal(nextVolume(0.95, 1), 1);
    assert.equal(nextVolume(0, -1), 0);
    assert.equal(nextVolume(0.15, -1), 0.1);
  });

  it("clamps junk volume instead of propagating it", () => {
    assert.equal(nextVolume(Number.NaN, 1), 0.1);
  });

  it("steps through the published rates without running off either end", () => {
    assert.equal(nextRate(1, 1), 1.25);
    assert.equal(nextRate(2, 1), 2);
    assert.equal(nextRate(0.25, -1), 0.25);
    // An unknown rate (a restored preference that no longer exists) starts from 1x.
    assert.equal(nextRate(1.3, 1), 1.25);
    assert.ok(PLAYBACK_RATES.includes(nextRate(1, 1)));
  });
});

describe("episodes", () => {
  const episodes = buildEpisodes(3, 600);

  it("numbers from 1 and fills a duration", () => {
    assert.equal(episodes.length, 3);
    assert.deepEqual(episodes[0], { number: 1, title: "Épisode 1", duration: 600 });
    assert.equal(episodes[2]?.number, 3);
  });

  it("handles a series with no announced total", () => {
    assert.deepEqual(buildEpisodes(0), []);
    assert.deepEqual(buildEpisodes(-5), []);
  });

  it("labels rows the way streaming sites do", () => {
    assert.equal(episodeNumberLabel(1), "Ép. 1");
    assert.equal(episodeNumberLabel(42), "Ép. 42");
    assert.equal(episodeNumberLabel(0), "SP");
    assert.equal(episodeNumberLabel(-1), "PV");
  });

  it("finds an episode and reports the neighbours", () => {
    assert.equal(findEpisode(episodes, 2)?.title, "Épisode 2");
    assert.equal(findEpisode(episodes, 9), null);
    assert.equal(nextEpisodeNumber(episodes, 1), 2);
    assert.equal(nextEpisodeNumber(episodes, 3), null, "no episode after the last one");
    assert.equal(previousEpisodeNumber(episodes, 2), 1);
    assert.equal(previousEpisodeNumber(episodes, 1), null, "nothing before the first one");
  });

  it("walks neighbours even when the list is out of order", () => {
    const shuffled = [episodes[2]!, episodes[0]!, episodes[1]!];
    assert.equal(nextEpisodeNumber(shuffled, 1), 2);
    assert.equal(previousEpisodeNumber(shuffled, 3), 2);
  });
});

describe("resumePosition", () => {
  it("resumes well into an episode", () => {
    assert.equal(resumePosition(600, 1440), 600);
  });

  it("starts over instead of resuming into the last seconds", () => {
    // Under the 30s floor: relaunching into the ending is not resuming.
    assert.equal(resumePosition(20, 1440), null);
    assert.equal(resumePosition(0, 1440), null);
  });

  it("starts over when the viewer was already at the end", () => {
    assert.equal(resumePosition(1400, 1440), null, "95% of the way: finished");
    assert.equal(resumePosition(1300, 1440), 1300, "just under the threshold: resume");
  });

  it("ignores an unknown or corrupt saved position", () => {
    assert.equal(resumePosition(null, 1440), null);
    assert.equal(resumePosition(undefined, 1440), null);
    assert.equal(resumePosition(Number.NaN, 1440), null);
    // No duration known yet (real sources report it late): trust the position.
    assert.equal(resumePosition(600, null), 600);
  });
});

describe("progress", () => {
  it("clamps and reports a percentage", () => {
    assert.equal(progressRatio(720, 1440), 0.5);
    assert.equal(progressPercent(720, 1440), 50);
    assert.equal(progressRatio(-5, 1440), 0);
    assert.equal(progressRatio(2000, 1440), 1);
    assert.equal(progressPercent(0, 0), 0, "unknown duration is not 100%");
    assert.equal(progressPercent(10, 0), 0);
  });

  it("counts an episode as watched at 90%", () => {
    assert.equal(hasWatched(1296, 1440), true);
    assert.equal(hasWatched(1200, 1440), false);
  });
});

describe("shortcuts", () => {
  it("maps the keys a streaming site is expected to answer to", () => {
    assert.equal(shortcutForKey(" "), "toggle-play");
    assert.equal(shortcutForKey("k"), "toggle-play");
    assert.equal(shortcutForKey("j"), "seek-back");
    assert.equal(shortcutForKey("ArrowRight"), "seek-forward");
    assert.equal(shortcutForKey("ArrowUp"), "volume-up");
    assert.equal(shortcutForKey("m"), "toggle-mute");
    assert.equal(shortcutForKey("f"), "toggle-fullscreen");
    assert.equal(shortcutForKey("n"), "next-episode");
    assert.equal(shortcutForKey("p"), "previous-episode");
    assert.equal(shortcutForKey("Home"), "jump-start");
    assert.equal(shortcutForKey("Escape"), "close");
  });

  it("ignores anything it does not own, so typing is never hijacked", () => {
    assert.equal(shortcutForKey("a"), null);
    assert.equal(shortcutForKey("Enter"), null);
    assert.equal(shortcutForKey("Tab"), null);
    assert.equal(shortcutForKey("F5"), null);
  });

  it("maps the digits to a percentage of the episode", () => {
    assert.equal(percentFromDigit("0"), 0);
    assert.equal(percentFromDigit("5"), 50);
    assert.equal(percentFromDigit("9"), 90);
    assert.equal(percentFromDigit("a"), null);
    assert.equal(percentFromDigit(""), null);
  });
});

describe("skip cues", () => {
  it("fires on the intro then on the ending, and nowhere between", () => {
    const cues = defaultSkipCues(1440);
    assert.equal(activeSkipCue(cues, 0)?.kind, "intro");
    assert.equal(activeSkipCue(cues, 45)?.kind, "intro");
    assert.equal(activeSkipCue(cues, 500), null);
    assert.equal(activeSkipCue(cues, 1400)?.kind, "ending");
    // The end is exclusive: at the very last second the ending is over.
    assert.equal(activeSkipCue(cues, 1440), null);
  });

  it("never fires on a zero-length cue", () => {
    assert.equal(activeSkipCue([{ kind: "intro", start: 10, end: 10 }], 10), null);
  });
});

describe("simulated episode length", () => {
  it("is the standard TV slot", () => {
    assert.equal(SIMULATED_EPISODE_SECONDS, 1440);
  });
});