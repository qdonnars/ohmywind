// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bodyEncoding, postJson, resetBodyEncoding } from "./postJson";

/** Le pendant de la compression, par la meme API web : le paquet n'a pas de
    @types/node, et DecompressionStream prouve la meme chose que zlib. */
async function gunzip(buffer: ArrayBuffer): Promise<string> {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

const URL_ = "https://example.test/api/v1/passage";

/** Over MIN_GZIP_BYTES, and compressible like a real corridor. */
const bigBody = () => ({
  waypoints: [
    [43.3, 5.35],
    [43.0, 6.2],
  ],
  forecast_cache: {
    points: Array.from({ length: 15 }, (_, i) => ({
      lat: 43.3 - i * 0.02,
      lon: 5.35 + i * 0.06,
      wind_kn: Array.from({ length: 48 }, (_, h) => 8 + (h % 7)),
    })),
  },
});

const smallBody = () => ({ waypoints: [[43.3, 5.35]], archetype: "cruiser_30ft" });

function ok(): Response {
  return new Response('{"ok":true}', { status: 200 });
}

interface Sent {
  encoding: string | null;
  contentType: string | null;
  body: ArrayBuffer | string;
}

/** Records what each call was handed, then answers as told. */
function stubFetch(...answers: (Response | Error)[]) {
  const sent: Sent[] = [];
  const fake = vi.fn(async (_url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    const raw = init.body;
    sent.push({
      encoding: headers.get("Content-Encoding"),
      contentType: headers.get("Content-Type"),
      body: typeof raw === "string" ? raw : (raw as ArrayBuffer),
    });
    const answer = answers[sent.length - 1] ?? answers[answers.length - 1];
    if (answer instanceof Error) throw answer;
    return answer;
  });
  vi.stubGlobal("fetch", fake);
  return sent;
}

function transportFailure(): TypeError {
  return new TypeError("Failed to fetch");
}

beforeEach(() => resetBodyEncoding());
afterEach(() => vi.unstubAllGlobals());

describe("postJson: compression", () => {
  it("sends gzip and declares it", async () => {
    const sent = stubFetch(ok());
    const body = bigBody();
    await postJson(URL_, body);
    expect(sent).toHaveLength(1);
    expect(sent[0].encoding).toBe("gzip");
    expect(sent[0].contentType).toBe("application/json");
    // Le corps est bien un gzip valide, et il redonne le JSON d'origine.
    expect(JSON.parse(await gunzip(sent[0].body as ArrayBuffer))).toEqual(body);
    expect(bodyEncoding()).toBe("gzip");
  });

  it("gagne des octets sur un corridor realiste", async () => {
    const sent = stubFetch(ok());
    const body = bigBody();
    await postJson(URL_, body);
    const clear = JSON.stringify(body).length;
    const compressed = (sent[0].body as ArrayBuffer).byteLength;
    expect(compressed).toBeLessThan(clear / 3);
  });

  it("laisse les petits corps en clair, ou gzip couterait plus qu'il ne rend", async () => {
    const sent = stubFetch(ok());
    await postJson(URL_, smallBody());
    expect(sent[0].encoding).toBeNull();
    expect(sent[0].body).toBe(JSON.stringify(smallBody()));
    // Rien n'a ete appris : la negociation attend un vrai corps.
    expect(bodyEncoding()).toBe("unknown");
  });

  it("part en clair quand le navigateur n'a pas CompressionStream", async () => {
    const sent = stubFetch(ok());
    vi.stubGlobal("CompressionStream", undefined);
    await postJson(URL_, bigBody());
    expect(sent[0].encoding).toBeNull();
  });

  it("passe le signal d'abandon aux deux tentatives", async () => {
    const seen: (AbortSignal | null | undefined)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: RequestInit) => {
        seen.push(init.signal);
        return seen.length === 1 ? new Response("", { status: 415 }) : ok();
      }),
    );
    const controller = new AbortController();
    await postJson(URL_, bigBody(), controller.signal);
    expect(seen).toEqual([controller.signal, controller.signal]);
  });
});

describe("postJson: repli", () => {
  it("rejoue une fois en clair sur un 415, puis ne compresse plus", async () => {
    const sent = stubFetch(new Response("", { status: 415 }), ok(), ok());
    const res = await postJson(URL_, bigBody());
    expect(res.status).toBe(200);
    expect(sent.map((s) => s.encoding)).toEqual(["gzip", null]);
    expect(bodyEncoding()).toBe("identity");

    // Le corps suivant part directement en clair : une seule requete.
    await postJson(URL_, bigBody());
    expect(sent).toHaveLength(3);
    expect(sent[2].encoding).toBeNull();
  });

  it("ne rejoue pas deux fois: un 415 sur la reprise en clair remonte tel quel", async () => {
    const sent = stubFetch(
      new Response("", { status: 415 }),
      new Response("", { status: 415 }),
    );
    const res = await postJson(URL_, bigBody());
    expect(res.status).toBe(415);
    expect(sent).toHaveLength(2);
  });

  it("ne rejoue pas sur une erreur du serveur qui n'est pas 415", async () => {
    const sent = stubFetch(new Response("", { status: 429 }));
    const res = await postJson(URL_, bigBody());
    expect(res.status).toBe(429);
    expect(sent).toHaveLength(1);
    // Le serveur a lu le corps compresse : l'encodage est acquis.
    expect(bodyEncoding()).toBe("gzip");
  });

  it("rejoue en clair quand le prevol refuse l'en-tete, une seule fois", async () => {
    const sent = stubFetch(transportFailure(), ok());
    const res = await postJson(URL_, bigBody());
    expect(res.status).toBe(200);
    expect(sent.map((s) => s.encoding)).toEqual(["gzip", null]);
    expect(bodyEncoding()).toBe("identity");
  });

  it("remonte la panne quand la reprise en clair echoue aussi", async () => {
    stubFetch(transportFailure(), transportFailure());
    await expect(postJson(URL_, bigBody())).rejects.toThrow(/failed to fetch/i);
  });

  it("ne sonde plus une fois l'encodage acquis: une panne reste une panne", async () => {
    const sent = stubFetch(ok(), transportFailure());
    await postJson(URL_, bigBody());
    expect(bodyEncoding()).toBe("gzip");
    await expect(postJson(URL_, bigBody())).rejects.toThrow(/failed to fetch/i);
    // Deux requetes en tout, pas trois : aucune reprise sur la seconde.
    expect(sent).toHaveLength(2);
  });

  it.each([
    ["AbortError", "AbortError"],
    ["TimeoutError", "TimeoutError"],
  ])("laisse passer un abandon (%s) sans le lire comme un refus", async (_label, name) => {
    const abort = new Error("aborted");
    abort.name = name;
    const sent = stubFetch(abort);
    await expect(postJson(URL_, bigBody())).rejects.toThrow("aborted");
    expect(sent).toHaveLength(1);
    expect(bodyEncoding()).toBe("unknown");
  });
});
