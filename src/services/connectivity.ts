import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export type OnlineListener = (online: boolean) => void;

let currentOnline = false;
let initialized = false;

// Derive "really online" from NetInfo. We treat a reachable internet as the
// signal that calls will succeed — mere Wi-Fi association is not enough.
function isStateOnline(state: NetInfoState): boolean {
  if (state.isConnected === false) return false;
  // isInternetReachable is null while NetInfo is still probing; treat it as
  // optimistically online so first-paint doesn't pessimistically false.
  return state.isInternetReachable !== false;
}

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;
  NetInfo.addEventListener((state) => {
    currentOnline = isStateOnline(state);
  });
  // Fire one initial read so callers don't have to wait for the first change.
  NetInfo.fetch()
    .then((state) => {
      currentOnline = isStateOnline(state);
    })
    .catch(() => {
      // NetInfo.fetch can reject on very old Android surfaces; default to
      // offline so we don't accidentally hammer the API when disconnected.
      currentOnline = false;
    });
}

export async function isOnline(): Promise<boolean> {
  ensureInitialized();
  const state = await NetInfo.fetch();
  currentOnline = isStateOnline(state);
  return currentOnline;
}

export function subscribe(cb: OnlineListener): () => void {
  ensureInitialized();
  const unsubscribe = NetInfo.addEventListener((state) => {
    const online = isStateOnline(state);
    currentOnline = online;
    cb(online);
  });
  return unsubscribe;
}

export function currentlyOnline(): boolean {
  return currentOnline;
}
