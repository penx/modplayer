import { Protracker } from "./Protracker";

export class ModWorkletProcessor
  extends AudioWorkletProcessor
  implements AudioWorkletProcessorImpl
{
  player: Protracker;
  constructor({
    numberOfInputs,
    numberOfOutputs,
    processorOptions,
  }: {
    numberOfInputs: number;
    numberOfOutputs: number;
    processorOptions: {
      buffer: Uint8Array;
      ext: string;
      options?: {
        autoplay?: boolean;
        repeat?: boolean;
      };
    };
  }) {
    super();
    const { buffer, ext, options } = processorOptions;

    switch (ext) {
      case "mod":
        this.player = new Protracker();
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

    if (this.player.parse(buffer)) {
      this.player.initialize();
      this.player.flags = 1 + 2;
      if (options?.repeat) {
        this.player.repeat = true;
      }
      if (options?.autoplay) {
        this.player.play();
      }
    } else {
      throw new Error("Unable to parse buffer");
    }
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ) {
    this.player.mix(outputs[0]);

    return true;
  }
}

export function register() {
  registerProcessor("ModWorkletProcessor", ModWorkletProcessor);
}
