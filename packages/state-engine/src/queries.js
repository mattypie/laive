function valuesInOrder(ids, collection) {
  return ids.map((id) => collection[id]).filter(Boolean);
}

export function summarizeProject(state) {
  const tracks = valuesInOrder(state.trackOrder, state.tracks);
  const scenes = valuesInOrder(state.sceneOrder, state.scenes);
  const clips = Object.values(state.clips);
  const playingClips = clips.filter((clip) => clip.isPlaying);

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
          isRecording: state.song.isRecording
        }
      : null,
    counts: {
      tracks: tracks.length,
      visibleTracks: state.visibleTrackIds.length,
      returnTracks: state.returnTrackIds.length,
      scenes: scenes.length,
      clips: clips.length,
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
  const scene = selection.selectedSceneId
    ? state.scenes[selection.selectedSceneId] ?? null
    : null;

  return {
    selection,
    track,
    clip,
    device,
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

export function listPlayingClips(state) {
  return Object.values(state.clips)
    .filter((clip) => clip.isPlaying)
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

  const sessionClips = valuesInOrder(track.sessionClipIds, state.clips);
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
