function valuesInOrder(ids, collection) {
  return ids.map((id) => collection[id]).filter(Boolean);
}

function resolveSelectedParameter(state, selection, track) {
  if (!selection?.selectedParameterId) {
    return null;
  }

  const directParameter = state.parameters[selection.selectedParameterId] ?? null;
  if (directParameter) {
    return directParameter;
  }

  const parameterId = String(selection.selectedParameterId);
  if (parameterId.startsWith("mixer:")) {
    const suffix = parameterId.split(":").at(-1);
    if (suffix === "volume") {
      return { id: parameterId, name: "Track Volume" };
    }
    if (suffix === "panning") {
      return { id: parameterId, name: "Track Panning" };
    }
  }

  if (parameterId.startsWith("send:") && track?.sends?.length) {
    const sendIndex = Number(parameterId.split(":").at(-1)) - 1;
    const send = Number.isInteger(sendIndex) ? track.sends[sendIndex] ?? null : null;
    if (send) {
      return { id: parameterId, name: send.name };
    }
  }

  return { id: parameterId, name: null };
}

function resolvePlayingClips(state) {
  const playingClips = new Map();

  for (const clip of Object.values(state.clips)) {
    if (clip.isPlaying) {
      playingClips.set(clip.id, clip);
    }
  }

  for (const track of valuesInOrder(state.trackOrder, state.tracks)) {
    if (!Number.isInteger(track.playingSlotIndex) || track.playingSlotIndex < 0) {
      continue;
    }

    const playingClip = valuesInOrder(track.sessionClipIds, state.clips).find(
      (clip) => clip.slotIndex === track.playingSlotIndex
    );

    if (playingClip) {
      playingClips.set(playingClip.id, {
        ...playingClip,
        isPlaying: true
      });
    }
  }

  return [...playingClips.values()];
}

export function summarizeProject(state) {
  const tracks = valuesInOrder(state.trackOrder, state.tracks);
  const scenes = valuesInOrder(state.sceneOrder, state.scenes);
  const clips = Object.values(state.clips);
  const playingClips = resolvePlayingClips(state);
  const arrangementClips = clips.filter((clip) => clip.location === "arrangement");

  return {
    snapshotVersion: state.meta.snapshotVersion,
    lastUpdatedAt: state.meta.lastUpdatedAt,
    dirtyPaths: [...state.meta.dirtyPaths],
    application: state.application
      ? {
          versionLabel: state.application.versionLabel,
          mode: state.application.mode
        }
      : null,
    song: state.song
      ? {
          name: state.song.name,
          tempo: state.song.tempo,
          isPlaying: state.song.isPlaying,
          isRecording: state.song.isRecording,
          currentSongTime: state.song.currentSongTime,
          arrangementPositionBeats: state.song.arrangementPositionBeats,
          loopEnabled: state.song.loopEnabled,
          loopStartBeats: state.song.loopStartBeats,
          loopLengthBeats: state.song.loopLengthBeats
        }
      : null,
    counts: {
      tracks: tracks.length,
      visibleTracks: state.visibleTrackIds.length,
      returnTracks: state.returnTrackIds.length,
      masterTracks: state.masterTrackId ? 1 : 0,
      scenes: scenes.length,
      clips: clips.length,
      arrangementClips: arrangementClips.length,
      devices: Object.keys(state.devices).length,
      parameters: Object.keys(state.parameters).length,
      playingClips: playingClips.length
    },
    playingClips: playingClips.map((clip) => ({
      id: clip.id,
      name: clip.name,
      trackId: clip.trackId,
      location: clip.location,
      slotIndex: clip.slotIndex,
      index: clip.index
    }))
  };
}

export function getArrangementSummary(state) {
  const tracks = valuesInOrder(state.trackOrder, state.tracks);
  const arrangementTracks = tracks
    .map((track) => ({
      id: track.id,
      name: track.name,
      section: track.section,
      arrangementClips: valuesInOrder(track.arrangementClipIds, state.clips)
    }))
    .filter((track) => track.arrangementClips.length > 0);
  const arrangementClips = arrangementTracks.flatMap((track) =>
    track.arrangementClips.map((clip) => ({
      ...clip,
      trackName: track.name
    }))
  );

  return {
    snapshotVersion: state.meta.snapshotVersion,
    lastUpdatedAt: state.meta.lastUpdatedAt,
    song: state.song
      ? {
          name: state.song.name,
          isPlaying: state.song.isPlaying,
          currentSongTime: state.song.currentSongTime,
          arrangementPositionBeats: state.song.arrangementPositionBeats,
          loopEnabled: state.song.loopEnabled,
          loopStartBeats: state.song.loopStartBeats,
          loopLengthBeats: state.song.loopLengthBeats
        }
      : null,
    counts: {
      arrangementTracks: arrangementTracks.length,
      arrangementClips: arrangementClips.length
    },
    tracks: arrangementTracks.map((track) => ({
      id: track.id,
      name: track.name,
      section: track.section,
      arrangementClipCount: track.arrangementClips.length
    })),
    arrangementClips: arrangementClips.map((clip) => ({
      id: clip.id,
      name: clip.name,
      trackId: clip.trackId,
      trackName: clip.trackName,
      index: clip.index,
      startBeats: clip.startBeats,
      endBeats: clip.endBeats,
      loopStartBeats: clip.loopStartBeats,
      loopEndBeats: clip.loopEndBeats,
      isPlaying: clip.isPlaying
    }))
  };
}

export function getArrangementTrackDetails(state, trackId) {
  const details = getTrackDetails(state, trackId);

  if (!details) {
    return null;
  }

  return {
    track: details.track,
    arrangementClips: [...details.arrangementClips].sort((left, right) => {
      const leftStart = Number.isFinite(left.startBeats) ? left.startBeats : Number.POSITIVE_INFINITY;
      const rightStart = Number.isFinite(right.startBeats) ? right.startBeats : Number.POSITIVE_INFINITY;
      if (leftStart !== rightStart) {
        return leftStart - rightStart;
      }
      return (left.index ?? 0) - (right.index ?? 0);
    })
  };
}

export function getSelectedContext(state) {
  const selection = state.selection;

  if (!selection) {
    return null;
  }

  const track = selection.selectedTrackId
    ? state.tracks[selection.selectedTrackId] ?? null
    : null;
  const clip = selection.selectedClipId
    ? state.clips[selection.selectedClipId] ?? null
    : null;
  const device = selection.selectedDeviceId
    ? state.devices[selection.selectedDeviceId] ?? null
    : null;
  const parameter = resolveSelectedParameter(state, selection, track);
  const scene = selection.selectedSceneId
    ? state.scenes[selection.selectedSceneId] ?? null
    : null;

  const detailViewTarget =
    selection.detailViewTarget ??
    (clip ? "clip" : device ? "device" : selection.detailView ?? null);
  const selectedClipLocation = selection.selectedClipLocation ?? clip?.location ?? null;
  const selectedArrangementClip =
    selectedClipLocation === "arrangement" && clip
      ? {
          id: clip.id,
          trackId: clip.trackId,
          name: clip.name,
          startBeats: clip.startBeats,
          endBeats: clip.endBeats,
          loopStartBeats: clip.loopStartBeats,
          loopEndBeats: clip.loopEndBeats,
          hasEnvelopes: clip.hasEnvelopes,
          isMidi: clip.isMidi,
          isAudio: clip.isAudio,
          noteCount: clip.noteCount
        }
      : null;
  const selectedSessionClip =
    selectedClipLocation === "session" && clip
      ? {
          id: clip.id,
          trackId: clip.trackId,
          name: clip.name,
          slotIndex: clip.slotIndex,
          loopStartBeats: clip.loopStartBeats,
          loopEndBeats: clip.loopEndBeats,
          hasEnvelopes: clip.hasEnvelopes,
          isMidi: clip.isMidi,
          isAudio: clip.isAudio,
          noteCount: clip.noteCount
        }
      : null;

  return {
    selection,
    selectedTrackId: track?.id ?? selection.selectedTrackId ?? null,
    selectedTrackName: track?.name ?? null,
    selectedSceneId: scene?.id ?? selection.selectedSceneId ?? null,
    selectedSceneName: scene?.name ?? null,
    selectedClipId: clip?.id ?? selection.selectedClipId ?? null,
    selectedClipLocation,
    selectedParameterId: parameter?.id ?? selection.selectedParameterId ?? null,
    selectedParameterName: parameter?.name ?? null,
    detailViewTarget,
    arrangementSelection: {
      arrangementPositionBeats:
        selection.arrangementPositionBeats ?? state.song?.arrangementPositionBeats ?? null,
      currentSongTime: selection.currentSongTime ?? state.song?.currentSongTime ?? null
    },
    selectedArrangementClip,
    selectedSessionClip,
    track,
    clip,
    device,
    parameter,
    scene
  };
}

export function findTrack(state, query) {
  const searchValue = String(query ?? "").trim().toLowerCase();

  if (!searchValue) {
    return null;
  }

  if (state.tracks[searchValue]) {
    return state.tracks[searchValue];
  }

  return Object.values(state.tracks).find((track) => {
    if (String(track.index) === searchValue) {
      return true;
    }

    return track.name.toLowerCase() === searchValue;
  }) ?? null;
}

export function listReturnTracks(state) {
  return valuesInOrder(state.returnTrackIds, state.tracks);
}

export function getMasterTrack(state) {
  return state.masterTrackId ? state.tracks[state.masterTrackId] ?? null : null;
}

export function listPlayingClips(state) {
  return resolvePlayingClips(state)
    .map((clip) => ({
      clip,
      track: state.tracks[clip.trackId] ?? null
    }));
}

export function getTrackDetails(state, trackId) {
  const track = state.tracks[trackId] ?? null;

  if (!track) {
    return null;
  }

  const sessionClips = valuesInOrder(track.sessionClipIds, state.clips).map((clip) => ({
    ...clip,
    isPlaying:
      clip.isPlaying ||
      (Number.isInteger(track.playingSlotIndex) && clip.slotIndex === track.playingSlotIndex)
  }));
  const arrangementClips = valuesInOrder(track.arrangementClipIds, state.clips);
  const devices = valuesInOrder(track.deviceIds, state.devices).map((device) => ({
    ...device,
    parameters: valuesInOrder(device.parameterIds, state.parameters)
  }));

  return {
    track,
    sessionClips,
    arrangementClips,
    devices
  };
}

export function searchEntities(state, query) {
  const searchValue = String(query ?? "").trim().toLowerCase();

  if (!searchValue) {
    return [];
  }

  const collections = [
    ...Object.values(state.tracks),
    ...Object.values(state.scenes),
    ...Object.values(state.clips),
    ...Object.values(state.devices),
    ...Object.values(state.parameters)
  ];

  return collections.filter((entity) => {
    if (entity.id.toLowerCase().includes(searchValue)) {
      return true;
    }

    return String(entity.name ?? "")
      .toLowerCase()
      .includes(searchValue);
  });
}
