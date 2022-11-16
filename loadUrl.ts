import { Protracker } from "./Protracker";

const supportedformats = ["mod", "s3m", "xm"];

export function loadUrl(
  url: string,
  options?: { autoplay?: boolean; repeat?: boolean }
) {
  let ext = url.split(".").pop()?.toLowerCase().trim();
  if (!ext || supportedformats.indexOf(ext) == -1) {
    // unknown extension, maybe amiga-style prefix?
    ext = url.split("/").pop()?.split(".").shift()?.toLowerCase().trim();
    if (!ext || supportedformats.indexOf(ext) == -1) {
      // ok, give up
      throw new Error(`Unsupported file extension ${ext}`);
    }
  }

  let player: Protracker;
  switch (ext) {
    case "mod":
      player = new Protracker();
      break;
    // case "s3m":
    //   player = new Screamtracker();
    //   break;
    // case "xm":
    //   player = new Fasttracker();
    //   break;
    default:
      throw new Error(`Unsupported file extension ${ext}`);
  }

  const request = new XMLHttpRequest();
  request.open("GET", url, true);
  request.responseType = "arraybuffer";

  request.onload = function () {
    const buffer = new Uint8Array(request.response);
    if (player.parse(buffer)) {
      createContext(player);
      player.initialize();
      player.flags = 1 + 2;
      if (options?.repeat) {
        player.repeat = true;
      }
      if (options?.autoplay) {
        player.play();
      }
    } else {
      throw new Error("Unable to parse buffer");
    }
  };
  request.send();

  return player;
}

function createContext(player: Protracker): AudioContext {
  const context = new AudioContext();
  const samplerate = context.sampleRate;
  const bufferlen = samplerate > 44100 ? 4096 : 2048;
  const filterNode = context.createBiquadFilter();
  filterNode.frequency.value = 22050;

  // "LED filter" at 3275kHz - off by default
  // TODO:
  // const lowpassNode = context.createBiquadFilter();
  // player.setfilter(filter);

  // mixer
  const mixerNode = context.createScriptProcessor(bufferlen, 1, 2);
  mixerNode.onaudioprocess = (event: AudioProcessingEvent) => {
    const bufs = [
      event.outputBuffer.getChannelData(0),
      event.outputBuffer.getChannelData(1),
    ];
    const buflen = event.outputBuffer.length;
    player.mix(bufs, buflen);
  };

  mixerNode.connect(filterNode);
  filterNode.connect(context.destination);
  // lowpassNode.connect(context.destination);

  return context;
}
