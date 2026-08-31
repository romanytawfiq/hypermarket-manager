import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";
import { isTest } from "@/lib/env";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("merges conflicting Tailwind utilities (last wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-primary bg-destructive", "bg-primary")).toBe(
      "text-primary bg-primary",
    );
  });

  it("ignores falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
});

describe("env", () => {
  it("is flagged as the test environment", () => {
    expect(isTest).toBe(true);
  });
});
