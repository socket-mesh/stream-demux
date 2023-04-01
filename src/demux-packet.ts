export type DemuxPacket<T, TReturn> = DemuxStreamPacket<T, TReturn> | DemuxConsumerPacket<T, TReturn>;

export interface DemuxStreamPacket<T, TReturn> {
	stream: string,
	data: IteratorResult<T, TReturn>
}

export interface DemuxConsumerPacket<T, TReturn> {
	consumerId: number,
	data: IteratorResult<T, TReturn>
}