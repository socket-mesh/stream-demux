import { ConsumableStream } from "@socket-mesh/consumable-stream";
import { StreamConsumer } from "./stream-consumer";
import { StreamDemux } from "./stream-demux";

export class DemuxedConsumableStream<T> extends ConsumableStream<T, T> {
	name: string;
	usabilityMode: boolean;
	private _streamDemux: StreamDemux<T>;

	constructor(streamDemux: StreamDemux<T>, name: string, usabilityMode?: boolean) {
		super();
		this._streamDemux = streamDemux;
		this.name = name;
		this.usabilityMode = !!usabilityMode;
	}

	createConsumer(timeout?: number): StreamConsumer<T> {
		return this._streamDemux.createConsumer(
			this.name,
			timeout,
			this.usabilityMode
		);
	}
}
