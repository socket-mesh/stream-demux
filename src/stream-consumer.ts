import { Consumer, ConsumerNode, WritableConsumableStream } from "@socket-mesh/writable-consumable-stream";
import { StreamDemuxStats } from "./stream-demux-stats";
import { DemuxPacket } from "./demux-packet.js";
import { Consumer as ConsumableStreamConsumer } from "@socket-mesh/consumable-stream";

export class StreamConsumer<T> extends Consumer<DemuxPacket<T>, T> implements ConsumableStreamConsumer<T, T> {
	streamName: string;
	usabilityMode: boolean;

	constructor(stream: WritableConsumableStream<DemuxPacket<T>, T>, id: number, startNode: ConsumerNode<DemuxPacket<T>, T>, streamName: string,
			timeout?: number, usabilityMode?: boolean) {

		super(stream, id, startNode, timeout);

		this.streamName = streamName;
		this.usabilityMode = !!usabilityMode;
	}

	getStats(): StreamDemuxStats {
		return Object.assign(
			super.getStats(),
			{
				stream: this.streamName
			}
		);
	}

	write(packet: IteratorResult<DemuxPacket<T>, T>): void {
		if (packet.done || (typeof packet.value === 'object' && 'stream' in packet.value && packet.value.stream === this.streamName)) {
			this.clearActiveTimeout(packet);
			this.applyBackpressure(packet);
		}
		if (this._resolve) {
			this._resolve();
			delete this._resolve;
		}
	}

	async next(): Promise<IteratorResult<T, T>> {
		this.stream.setConsumer(this.id, this);

		while (true) {
			if (!this.currentNode.next) {
				try {
					await this._waitForNextItem(this.timeout);
				} catch (error) {
					this._destroy();
					throw error;
				}
			}
			if (this._killPacket) {
				this._destroy();
				let killPacket = this._killPacket;
				delete this._killPacket;

				return killPacket;
			}

			// Skip over nodes which belong to different streams.
			while (
				this.currentNode.next?.data?.value &&
				this.currentNode.next.data.done !== true &&
				(!('stream' in this.currentNode.next.data.value) || this.currentNode.next.data.value.stream !== this.streamName) &&
				this.currentNode.next.consumerId !== this.id
			) {
				this.currentNode = this.currentNode.next;
				this.usabilityMode && await wait(0);
			}

			if (!this.currentNode.next) {
				continue;
			}

			this.currentNode = this.currentNode.next;

			this.releaseBackpressure(this.currentNode.data);

			if (this.currentNode.data.done === true) {
				this._destroy();
				return this.currentNode.data;
			}

			if (this.currentNode.data?.value?.data?.done === true) {
				this._destroy();
				return this.currentNode.data.value.data;
			}

			return this.currentNode.data.value.data;
		}
	}

	return(): Promise<IteratorResult<T, T>> {
		this.currentNode = null;
		this._destroy();
		return {} as any;
	}
}

function wait(duration: number) {
	return new Promise<void>((resolve) => {
		setTimeout(() => {
			resolve();
		}, duration);
	});
}