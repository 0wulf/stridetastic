import { describe, expect, it } from 'vitest';
import { calculateActualHops, findPathsBetweenNodes } from '@/lib/pathFinding';

describe('pathFinding', () => {
	it('respects directionality (no reverse unless reverse link exists)', () => {
		const links = [
			{ source: 'A', target: 'B' },
			{ source: 'B', target: 'C' },
		] as any;

		// A -> C should be possible
		const pathsForward = findPathsBetweenNodes('A', 'C', links, { maxHops: 5, maxPaths: 10 });
		expect(pathsForward).toEqual([['A', 'B', 'C']]);

		// C -> A should NOT be possible without reverse links
		const pathsBackward = findPathsBetweenNodes('C', 'A', links, { maxHops: 5, maxPaths: 10 });
		expect(pathsBackward).toEqual([]);
	});

	it('treats zero-hop nodes as not counting toward hop limit', () => {
		const path = ['A', 'iface_1', 'B'];
		const hops = calculateActualHops(path, new Set(['iface_1']));
		expect(hops).toBe(0);
	});
});
