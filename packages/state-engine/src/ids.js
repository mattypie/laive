const trackSectionOrder = {
  visible: 0,
  return: 1,
  master: 2
};

export function makeTrackId(section = "visible", index = 0) {
  return `track:${section}:${index}`;
}

export function makeSceneId(index = 0) {
  return `scene:${index}`;
}

export function makeSessionClipId(trackId, slotIndex = 0) {
  return `clip:session:${trackId}:slot:${slotIndex}`;
}

export function makeArrangementClipId(trackId, index = 0) {
  return `clip:arrangement:${trackId}:index:${index}`;
}

export function makeDeviceId(trackId, index = 0) {
  return `device:${trackId}:index:${index}`;
}

export function makeParameterId(deviceId, index = 0) {
  return `parameter:${deviceId}:param:${index}`;
}

export function compareTrackIds(leftId, rightId) {
  const left = parseTrackId(leftId);
  const right = parseTrackId(rightId);

  if (left.section !== right.section) {
    return (trackSectionOrder[left.section] ?? 99) - (trackSectionOrder[right.section] ?? 99);
  }

  return left.index - right.index;
}

export function parseTrackId(trackId) {
  const parts = String(trackId ?? "").split(":");
  if (parts.length === 2 && parts[0] === "track" && parts[1] === "master") {
    return {
      id: trackId,
      section: "master",
      index: 0
    };
  }
  if (parts.length === 2 && parts[0] === "track") {
    return {
      id: trackId,
      section: "visible",
      index: Number(parts[1]) || 0
    };
  }
  if (parts.length === 3 && parts[0] === "track" && parts[1] === "master") {
    return {
      id: trackId,
      section: "master",
      index: Number(parts[2]) || 0
    };
  }
  const [, section, rawIndex] = parts;
  return {
    id: trackId,
    section: section || "visible",
    index: Number(rawIndex) || 0
  };
}

export function parseSceneId(sceneId) {
  const [, rawIndex] = sceneId.split(":");
  return {
    id: sceneId,
    index: Number(rawIndex)
  };
}
