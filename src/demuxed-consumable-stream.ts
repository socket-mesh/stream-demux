import { ConsumableStream } from "@socket-mesh/consumable-stream";
import { Consumer } from "@socket-mesh/writable-consumable-stream";

interface ConsumerCreator<T> {
	createConsumer(streamName: string, timeout?: number): Consumer<T, T>
}

export class DemuxedConsumableStream<T> extends ConsumableStream<T, T> {
	name: string;
	private _streamDemux: ConsumerCreator<T>;

  constructor(streamDemux: ConsumerCreator<T>, name: string) {
    super();
    this.name = name;
    this._streamDemux = streamDemux;
  }

  createConsumer(timeout?: number): Consumer<T> {
    return this._streamDemux.createConsumer(this.name, timeout);
  }
}
