import { describe, expect, it, vi } from "vitest";
import {
  REPLY_GMAIL_REAUTH_REQUIRED,
  REPLY_NO_RECIPIENT,
  REPLY_REQUEST_ID_REUSED,
  REPLY_SEND_IN_PROGRESS,
  REPLY_SEND_UNCONFIRMED,
  REPLY_SENT_NOT_RECORDED,
} from "../constants/replySendDetails";
import type { InquiryMessage } from "../types/inquiry/inquiry-message";
import { errorDetail } from "../utils/errorDetail";
import { fnv1aHash } from "../utils/fnv1aHash";
import { replyMightHaveSent } from "../utils/replyMightHaveSent";
import { replyMightHaveSentKey } from "../utils/replyMightHaveSentKey";
import { replyRequestKey } from "../utils/replyRequestKey";
import { replySendFailure } from "../utils/replySendFailure";
import { sendReplyOnce } from "../utils/sendReplyOnce";

const failed = (status: number | undefined, detail?: unknown) => ({ status, data: { detail } });

describe("replySendFailure", () => {
  it.each([
    [failed(403), "viewOnly"],
    [failed(404), "gone"],
    [failed(409, REPLY_SEND_IN_PROGRESS), "inFlight"],
    [failed(422, "Connect Gmail before replying to inquiries."), "gmailConnection"],
    [failed(422, [{ loc: ["body", "subject"] }]), "refused"],
    [failed(422, REPLY_REQUEST_ID_REUSED), "refused"],
    [failed(422, REPLY_NO_RECIPIENT), "noRecipient"],
    [failed(500, REPLY_SENT_NOT_RECORDED), "notRecorded"],
    [failed(502, "Gmail rejected the message"), "gmailRejected"],
    [failed(503, REPLY_GMAIL_REAUTH_REQUIRED), "gmailDisconnected"],
    [failed(504, REPLY_SEND_UNCONFIRMED), "unsure"],
    [failed(500), "unsure"],
    [failed(undefined), "unsure"],
    [new Error("Network Error"), "unsure"],
    [failed(400), "refused"],
  ] as const)("%j is %s", (error, expected) => {
    expect(replySendFailure(error)).toBe(expected);
  });
});

describe("sendReplyOnce", () => {
  const message = { id: "m1" } as InquiryMessage;
  const options = (post: () => Promise<InquiryMessage>, keepGoing = () => true) => {
    const waits: number[] = [];
    const waiting: boolean[] = [];
    return {
      waits,
      waiting,
      run: () =>
        sendReplyOnce({
          post,
          delays: [10, 20],
          sleep: async (ms) => {
            waits.push(ms);
          },
          keepGoing,
          onWaiting: (value) => waiting.push(value),
        }),
    };
  };

  it("returns the sent message and spends the id", async () => {
    const { run } = options(() => Promise.resolve(message));
    expect(await run()).toEqual({ result: { ok: true, message }, idSpent: true });
  });

  it("asks again while an earlier attempt is in flight, then gets the reply", async () => {
    const post = vi
      .fn<() => Promise<InquiryMessage>>()
      .mockRejectedValueOnce(failed(409, REPLY_SEND_IN_PROGRESS))
      .mockResolvedValueOnce(message);
    const { run, waits, waiting } = options(post);
    expect((await run()).result).toEqual({ ok: true, message });
    expect(post).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([10]);
    expect(waiting).toEqual([true, false]);
  });

  it("stops after the last wait and keeps the id", async () => {
    const post = vi.fn<() => Promise<InquiryMessage>>().mockRejectedValue(failed(409, REPLY_SEND_IN_PROGRESS));
    const { run, waits } = options(post);
    expect(await run()).toEqual({ result: { ok: false, failure: "inFlight" }, idSpent: false });
    expect(post).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([10, 20]);
  });

  it("stops waiting once the screen has gone", async () => {
    const post = vi.fn<() => Promise<InquiryMessage>>().mockRejectedValue(failed(409, REPLY_SEND_IN_PROGRESS));
    const { run, waits } = options(post, () => false);
    expect((await run()).result).toEqual({ ok: false, failure: "inFlight" });
    expect(waits).toEqual([]);
  });

  it("stops without one more ask when the screen goes during a wait", async () => {
    const post = vi.fn<() => Promise<InquiryMessage>>().mockRejectedValue(failed(409, REPLY_SEND_IN_PROGRESS));
    let open = true;
    const waiting: boolean[] = [];
    const outcome = await sendReplyOnce({
      post,
      delays: [10, 20],
      sleep: async () => {
        open = false;
      },
      keepGoing: () => open,
      onWaiting: (value) => waiting.push(value),
    });
    expect(outcome).toEqual({ result: { ok: false, failure: "inFlight" }, idSpent: false });
    expect(post).toHaveBeenCalledTimes(1);
    expect(waiting).toEqual([true, false]);
  });

  it("keeps the id when the reply went out but wasn't recorded", async () => {
    const { run } = options(() => Promise.reject(failed(500, REPLY_SENT_NOT_RECORDED)));
    expect(await run()).toEqual({ result: { ok: false, failure: "notRecorded" }, idSpent: false });
  });

  it("keeps the id after an unconfirmed send, so trying again can't email twice", async () => {
    const { run } = options(() => Promise.reject(failed(504, REPLY_SEND_UNCONFIRMED)));
    expect(await run()).toEqual({ result: { ok: false, failure: "unsure" }, idSpent: false });
  });

  it("spends an id the server holds for a different reply", async () => {
    const { run } = options(() => Promise.reject(failed(422, REPLY_REQUEST_ID_REUSED)));
    expect(await run()).toEqual({ result: { ok: false, failure: "refused" }, idSpent: true });
  });

  it("doesn't wait on other failures", async () => {
    const { run, waits } = options(() => Promise.reject(failed(502, "rejected")));
    expect((await run()).result).toEqual({ ok: false, failure: "gmailRejected" });
    expect(waits).toEqual([]);
  });
});

describe("replyRequestKey", () => {
  const draft = { template_id: null, subject: "Re: Room", body: "Yes, it's open." };

  it("is the same for the same reply to the same inquiry", () => {
    expect(replyRequestKey("i1", { ...draft })).toBe(replyRequestKey("i1", draft));
  });

  it.each([
    ["another inquiry", "i2", draft],
    ["another subject", "i1", { ...draft, subject: "Re: Room!" }],
    ["another body", "i1", { ...draft, body: "Yes, it's open. " }],
    ["a template", "i1", { ...draft, template_id: "t1" }],
  ] as const)("differs for %s", (_label, inquiryId, other) => {
    expect(replyRequestKey(inquiryId, other)).not.toBe(replyRequestKey("i1", draft));
  });

  it("treats a missing template like none, as the server does", () => {
    expect(replyRequestKey("i1", { subject: draft.subject, body: draft.body })).toBe(replyRequestKey("i1", draft));
  });

  it("doesn't keep the reply's text", () => {
    expect(replyRequestKey("i1", draft)).not.toContain("open");
  });
});

describe("fnv1aHash", () => {
  it("matches the published FNV-1a values", () => {
    expect(fnv1aHash("")).toBe("811c9dc5");
    expect(fnv1aHash("a")).toBe("e40c292c");
    expect(fnv1aHash("foobar")).toBe("bf9cf968");
  });
});

describe("errorDetail", () => {
  it("reads the body's detail and tolerates anything else", () => {
    expect(errorDetail(failed(409, "x"))).toBe("x");
    expect(errorDetail(null)).toBeUndefined();
    expect(errorDetail(new Error("Network Error"))).toBeUndefined();
  });
});

describe("replyMightHaveSent", () => {
  it.each([
    ["unsure", true],
    ["notRecorded", true],
    ["inFlight", true],
    ["gmailRejected", false],
    ["gmailDisconnected", false],
    ["refused", false],
    ["noRecipient", false],
  ] as const)("%s is %s", (failure, expected) => {
    expect(replyMightHaveSent(failure)).toBe(expected);
  });

  it("is marked per inquiry, apart from any reply's key", () => {
    expect(replyMightHaveSentKey("i1")).not.toBe(replyMightHaveSentKey("i2"));
    expect(replyMightHaveSentKey("i1")).not.toBe(replyRequestKey("i1", { template_id: null, subject: "", body: "" }));
  });
});
