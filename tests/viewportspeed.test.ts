/**
 * The camera's speed: the limits Shift+scroll and the Speed field share, the
 * field's text, and what its text sets.
 */

import { describe, expect, it } from "vitest";
import {
	clampSpeed,
	readSpeed,
	SPEED_MAX,
	SPEED_MIN,
	SPEED_NOTCH,
	SPEED_STEP,
	speedText,
} from "../src/app/viewport/speed.js";

describe("camera speed", () => {
	it("keeps to a twentieth up to fifty times", () => {
		expect([SPEED_MIN, SPEED_MAX, SPEED_STEP, SPEED_NOTCH]).toEqual([0.05, 50, 0.05, 1.25]);
		expect(clampSpeed(0.01)).toBe(SPEED_MIN);
		expect(clampSpeed(80)).toBe(SPEED_MAX);
		expect(clampSpeed(2.5)).toBe(2.5);
	});

	it("shows two places at most, with no trailing noughts", () => {
		expect(speedText(1)).toBe("1");
		expect(speedText(1.25)).toBe("1.25");
		expect(speedText(1.5625)).toBe("1.56");
		expect(speedText(0.05)).toBe("0.05");
		expect(speedText(50)).toBe("50");
	});

	it("shows what Shift+scroll reaches as a speed the field takes back", () => {
		let speed = 1;
		for (let i = 0; i < 40; i++) {
			speed = clampSpeed(speed * SPEED_NOTCH);
			expect(readSpeed(speedText(speed))).toBeCloseTo(speed, 2);
		}
		expect(speed).toBe(SPEED_MAX);
	});

	it("takes typed speeds within the limits", () => {
		expect(readSpeed("2")).toBe(2);
		expect(readSpeed(" 0.5 ")).toBe(0.5);
		expect(readSpeed("500")).toBe(SPEED_MAX);
		expect(readSpeed("0.001")).toBe(SPEED_MIN);
	});

	it("leaves the speed alone while the text is not one yet", () => {
		expect(readSpeed("")).toBeNull();
		expect(readSpeed("0")).toBeNull();
		expect(readSpeed("-3")).toBeNull();
		expect(readSpeed("abc")).toBeNull();
	});
});
