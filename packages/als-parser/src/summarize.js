function readAttribute(tag, attributeName) {
  const match = new RegExp(`${attributeName}="([^"]*)"`, "i").exec(tag);
  return match?.[1] ?? null;
}

function collectTags(xml, tagName) {
  const matches = xml.match(new RegExp(`<${tagName}\\b[^>]*>`, "gi"));
  return matches ?? [];
}

function collectNames(xml, tagName) {
  const regex = new RegExp(
    `<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
    "gi"
  );
  const values = [];
  let match = regex.exec(xml);

  while (match) {
    const nameValue = /Value="([^"]*)"/i.exec(match[1])?.[1];
    if (nameValue) {
      values.push(nameValue);
    }
    match = regex.exec(xml);
  }

  return values;
}

function readTempo(xml) {
  const manualTempo =
    /<Manual[^>]*Value="([^"]+)"/i.exec(xml)?.[1] ??
    /<CurrentSongTempo[^>]*Value="([^"]+)"/i.exec(xml)?.[1] ??
    null;

  return manualTempo ? Number(manualTempo) : null;
}

function summarizeTrackTags(tags, type) {
  return tags.map((tag, index) => ({
    type,
    index,
    id: readAttribute(tag, "Id"),
    name: readAttribute(tag, "Name")
  }));
}

export function summarizeAlsXml(xml) {
  const audioTracks = summarizeTrackTags(collectTags(xml, "AudioTrack"), "audio");
  const midiTracks = summarizeTrackTags(collectTags(xml, "MidiTrack"), "midi");
  const returnTracks = summarizeTrackTags(collectTags(xml, "ReturnTrack"), "return");
  const scenes = collectNames(xml, "Scene");
  const locatorNames = collectNames(xml, "Locator");
  const clipTags = collectTags(xml, "MidiClip").concat(collectTags(xml, "AudioClip"));

  return {
    tempo: readTempo(xml),
    trackCounts: {
      audio: audioTracks.length,
      midi: midiTracks.length,
      return: returnTracks.length
    },
    tracks: [...audioTracks, ...midiTracks, ...returnTracks],
    scenes,
    locators: locatorNames,
    clipCount: clipTags.length
  };
}

export function diffSummaries(previousSummary, nextSummary) {
  const changes = [];

  if (previousSummary.tempo !== nextSummary.tempo) {
    changes.push({
      type: "tempo.changed",
      before: previousSummary.tempo,
      after: nextSummary.tempo
    });
  }

  for (const key of ["audio", "midi", "return"]) {
    if (previousSummary.trackCounts[key] !== nextSummary.trackCounts[key]) {
      changes.push({
        type: "trackCount.changed",
        trackType: key,
        before: previousSummary.trackCounts[key],
        after: nextSummary.trackCounts[key]
      });
    }
  }

  const previousScenes = new Set(previousSummary.scenes);
  const nextScenes = new Set(nextSummary.scenes);

  for (const scene of nextScenes) {
    if (!previousScenes.has(scene)) {
      changes.push({ type: "scene.added", scene });
    }
  }

  for (const scene of previousScenes) {
    if (!nextScenes.has(scene)) {
      changes.push({ type: "scene.removed", scene });
    }
  }

  if (previousSummary.clipCount !== nextSummary.clipCount) {
    changes.push({
      type: "clipCount.changed",
      before: previousSummary.clipCount,
      after: nextSummary.clipCount
    });
  }

  return changes;
}
