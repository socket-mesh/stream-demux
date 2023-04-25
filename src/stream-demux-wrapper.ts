import { DemuxedConsumableStream } from "./demuxed-consumable-stream";
import { StreamDemux } from "./stream-demux";
import { StreamDemuxStats } from "./stream-demux-stats";

export class StreamDemuxWrapper<T> {
	private readonly _streamDemux: StreamDemux<T>

	constructor(stream: StreamDemux<T>) {
		this._streamDemux = stream;
	}

	listen(name: string): DemuxedConsumableStream<T> {
		return this._streamDemux.listen(name);
	}

	close(): void;
	close(name: string): void;
	close(name?: string): void {
		if (name === undefined) {
			this._streamDemux.closeAll();
		}

		this._streamDemux.close(name);
	}

	kill(): void;
	kill(consumerId: number): void;
	kill(name: string): void;
	kill(name?: string | number): void {
		if (name === undefined) {
			this._streamDemux.killAll();
			return;
		}
		
		this._streamDemux.kill(name as any);
	}

	getConsumerStats(): StreamDemuxStats[];
	getConsumerStats(name: string): StreamDemuxStats[];
	getConsumerStats(consumerId: number): StreamDemuxStats;
	getConsumerStats(consumerId?: number | string): StreamDemuxStats[] | StreamDemuxStats {
		return this._streamDemux.getConsumerStats(consumerId as any);
	}
	
	getBackpressure(): number;
	getBackpressure(name: string): number;
	getBackpressure(consumerId: number): number;
	getBackpressure(consumerId?: number | string): number {
		return this._streamDemux.getBackpressure(consumerId as any);
	}

	hasConsumer(consumerId: number): boolean;
	hasConsumer(name: string, consumerId: number): boolean;
	hasConsumer(name: string | number, consumerId?: number): boolean {
		if (typeof name === "string") {
			return this._streamDemux.hasConsumer(name, consumerId);
		}

		return this._streamDemux.hasConsumer(name /* consumerId */);
	}
}