import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { gzipSync } from "node:zlib";
import type { AddressInfo, Socket } from "node:net";

export const synthetic_fixture = true;

const normalHomepage = `<!doctype html>
<html lang="en"><head>
<title>Clearwater Example Pool Care | Synthetic Fixture</title>
<meta name="description" content="Synthetic pool maintenance and repair fixture">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="/">
</head><body>
<h1>Pool service and pool repair</h1>
<nav>
<a href="/contact">Contact Us</a><a href="/about">About</a><a href="/team">Our Team</a>
<a href="/services">Services</a><a href="/booking">Book Service</a>
<a href="https://social.example/profile">Profile</a>
</nav>
<a href="tel:+1-202-555-0100">Call now</a>
<footer>Copyright 2026 Clearwater Example Pool Care. All rights reserved.</footer>
</body></html>`;

const localBusinessJsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Clearwater Example Pool Care",
  address: {
    "@type": "PostalAddress",
    streetAddress: "100 Example Avenue",
    addressLocality: "Example City",
    addressRegion: "EX",
    postalCode: "00000",
    addressCountry: "US",
  },
  contactPoint: { "@type": "ContactPoint", telephone: "+1-202-555-0100", email: "hello@example.test" },
  employee: { "@type": "Person", name: "Avery Example", jobTitle: "Operations Manager" },
  makesOffer: { "@type": "Service", name: "Pool maintenance" },
  sameAs: ["https://social.example/clearwater"],
});

export interface SyntheticServerOptions {
  robots?: "allow" | "deny" | "wildcard" | "failure" | "missing";
}

export interface SyntheticHttpServer {
  origin: string;
  url(pathname: string): string;
  counts: ReadonlyMap<string, number>;
  requests: ReadonlyArray<{ path: string; method: string; cookie: string | null; authorization: string | null }>;
  close(): Promise<void>;
}

function html(response: ServerResponse, body: string, status = 200): void {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8", etag: '"synthetic-v1"' });
  response.end(body);
}

export async function startSyntheticHttpServer(options: SyntheticServerOptions = {}): Promise<SyntheticHttpServer> {
  const counts = new Map<string, number>();
  const requests: Array<{ path: string; method: string; cookie: string | null; authorization: string | null }> = [];
  const sockets = new Set<Socket>();
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const route = requestUrl.pathname;
    counts.set(route, (counts.get(route) ?? 0) + 1);
    requests.push({ path: route, method: request.method ?? "", cookie: request.headers.cookie ?? null, authorization: request.headers.authorization ?? null });

    if (route === "/robots.txt") {
      if (options.robots === "failure") {
        response.writeHead(503, { "content-type": "text/plain" });
        response.end("temporary robots failure");
      } else if (options.robots === "missing") {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("not found");
      } else if (options.robots === "deny") {
        response.writeHead(200, { "content-type": "text/plain" });
        response.end("User-agent: RoccoResearchCrawler\nDisallow: /\n");
      } else if (options.robots === "wildcard") {
        response.writeHead(200, { "content-type": "text/plain" });
        response.end("User-agent: *\nDisallow: /blocked\nAllow: /blocked/public\nSitemap: /sitemap.xml\n");
      } else {
        response.writeHead(200, { "content-type": "text/plain" });
        response.end("User-agent: RoccoResearchCrawler\nAllow: /\nSitemap: /sitemap.xml\n");
      }
      return;
    }
    if (route === "/") return html(response, normalHomepage);
    if (route === "/contact") return html(response, `<!doctype html><html><head><title>Contact | Synthetic</title><meta name="viewport" content="width=device-width"></head><body><h1>Contact</h1><address>100 Example Avenue, Example City, EX 00000</address><a href="mailto:hello@example.test">Email</a><form action="/submit" method="post"><label>Name<input name="name"></label><button>Request an estimate</button></form></body></html>`);
    if (route === "/about") return html(response, `<!doctype html><html><head><title>About | Synthetic</title></head><body><h1>About our pool service</h1><p>Founded by Avery Example.</p></body></html>`);
    if (route === "/team") return html(response, `<!doctype html><html><head><title>Team | Synthetic</title></head><body><h1>Our Team</h1><p>Avery Example — Operations Manager</p><p>Jordan Sample — Technician</p></body></html>`);
    if (route === "/services") return html(response, `<!doctype html><html><head><title>Services | Synthetic</title></head><body><h1>Pool maintenance</h1><h2>Pool equipment repair</h2></body></html>`);
    if (route === "/booking") return html(response, `<!doctype html><html><head><title>Booking | Synthetic</title></head><body><h1>Schedule service</h1><a href="/contact">Request a quote</a></body></html>`);
    if (route === "/sitemap.xml") {
      response.writeHead(200, { "content-type": "application/xml" });
      response.end(`<?xml version="1.0"?><urlset><url><loc>http://127.0.0.1:${(server.address() as AddressInfo).port}/services</loc></url><url><loc>http://127.0.0.1:${(server.address() as AddressInfo).port}/blog/archive</loc></url></urlset>`);
      return;
    }
    if (route === "/jsonld") return html(response, `<!doctype html><html><head><title>Structured Synthetic</title><script type="application/ld+json">${localBusinessJsonLd}</script></head><body><h1>Pool maintenance</h1></body></html>`);
    if (route === "/malformed-jsonld") return html(response, `<!doctype html><html><head><title>Malformed Structured Synthetic</title><script type="application/ld+json">{"@type":"LocalBusiness",</script></head><body><h1>Still usable HTML</h1></body></html>`);
    if (route === "/malformed-html") return html(response, `<html lang=en><head><title>Malformed Synthetic<body><h1>Pool repair<a href=/contact>Contact`);
    if (route === "/redirect/one") {
      response.writeHead(302, { location: "/redirect/two", "content-type": "text/plain" });
      response.end("redirect");
      return;
    }
    if (route === "/redirect/two") {
      response.writeHead(301, { location: "/", "content-type": "text/plain" });
      response.end("redirect");
      return;
    }
    if (route === "/redirect-loop-a" || route === "/redirect-loop-b") {
      response.writeHead(302, { location: route.endsWith("a") ? "/redirect-loop-b" : "/redirect-loop-a", "content-type": "text/plain" });
      response.end("loop");
      return;
    }
    if (route === "/redirect-blocked") {
      response.writeHead(302, { location: "http://127.0.0.2/private", "content-type": "text/plain" });
      response.end("blocked redirect");
      return;
    }
    if (route === "/redirect-relative") {
      response.writeHead(302, { location: "../contact?from=relative", "content-type": "text/plain" });
      response.end("relative redirect");
      return;
    }
    if (route === "/redirect-scheme-relative") {
      response.writeHead(302, { location: `//127.0.0.1:${(server.address() as AddressInfo).port}/contact`, "content-type": "text/plain" });
      response.end("scheme-relative redirect");
      return;
    }
    if (route === "/redirect-credentials") {
      response.writeHead(302, { location: `http://user:secret@127.0.0.1:${(server.address() as AddressInfo).port}/`, "content-type": "text/plain" });
      response.end("credential redirect");
      return;
    }
    if (route === "/redirect-wrong-port") {
      response.writeHead(302, { location: "http://127.0.0.1:1/", "content-type": "text/plain" });
      response.end("wrong-port redirect");
      return;
    }
    if (route === "/redirect-ipv6-loopback") {
      response.writeHead(302, { location: `http://[::1]:${(server.address() as AddressInfo).port}/`, "content-type": "text/plain" });
      response.end("IPv6-loopback redirect");
      return;
    }
    if (route === "/redirect-link-local") {
      response.writeHead(302, { location: `http://169.254.169.254:${(server.address() as AddressInfo).port}/`, "content-type": "text/plain" });
      response.end("link-local redirect");
      return;
    }
    if (route === "/redirect-public-host") {
      response.writeHead(302, { location: `http://public.example:${(server.address() as AddressInfo).port}/`, "content-type": "text/plain" });
      response.end("public-host redirect");
      return;
    }
    if (route === "/redirect-hostname-case") {
      response.writeHead(302, { location: `http://LOCALHOST:${(server.address() as AddressInfo).port}/`, "content-type": "text/plain" });
      response.end("hostname-case redirect");
      return;
    }
    if (route === "/redirect-trailing-dot") {
      response.writeHead(302, { location: `http://127.0.0.1.:${(server.address() as AddressInfo).port}/`, "content-type": "text/plain" });
      response.end("trailing-dot redirect");
      return;
    }
    if (route === "/redirect-fragment") {
      response.writeHead(302, { location: "#different-fragment", "content-type": "text/plain" });
      response.end("fragment redirect");
      return;
    }
    if (route === "/oversized") return html(response, `<html><body>${"x".repeat(50_000)}</body></html>`);
    if (route === "/compressed-oversized") {
      const encoded = gzipSync(Buffer.from(`<html><body>${"z".repeat(50_000)}</body></html>`));
      response.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      response.end(encoded);
      return;
    }
    if (route === "/unsupported") {
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end(Buffer.from([0, 1, 2, 3]));
      return;
    }
    if (route === "/timeout") return;
    if (route === "/rate-limited" && (counts.get(route) ?? 0) < 2) {
      response.writeHead(429, { "content-type": "text/plain", "retry-after": "0" });
      response.end("retry later");
      return;
    }
    if (route === "/temporary-500" && (counts.get(route) ?? 0) < 3) {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end("temporary");
      return;
    }
    if (route === "/permanent-500") {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end("permanent");
      return;
    }
    if (route === "/auth") {
      response.writeHead(401, { "content-type": "text/plain", "www-authenticate": "Basic" });
      response.end("authentication required");
      return;
    }
    if (route === "/set-cookie") {
      response.writeHead(302, { location: "/cookie-check", "set-cookie": "synthetic=secret", "content-type": "text/plain" });
      response.end("cookie");
      return;
    }
    if (route === "/cookie-check") return html(response, request.headers.cookie ? "<html><body>cookie leaked</body></html>" : "<html><body>no cookie</body></html>");
    if (route === "/submit") return html(response, "<html><body>form submitted</body></html>");
    if (route === "/parked") return html(response, "<html><head><title>Domain for sale</title></head><body>Buy this domain. Parked domain.</body></html>");
    if (route === "/different-business-redirect") {
      response.writeHead(302, { location: "/different-business", "content-type": "text/plain" });
      response.end("redirect");
      return;
    }
    if (route === "/different-business") return html(response, "<html><head><title>Unrelated Example Roofing</title></head><body><h1>Unrelated Example Roofing</h1></body></html>");
    if (route === "/missing-features") return html(response, "<html lang=\"en\"><head><title>Minimal Synthetic Pool Care</title></head><body><h1>Pool maintenance</h1></body></html>");
    if (route === "/blocked" || route === "/blocked/public") return html(response, "<html><body><h1>Controlled blocked route</h1></body></html>");
    if (route === "/unavailable") {
      request.socket.destroy();
      return;
    }
    html(response, "<html><body>Not found</body></html>", 404);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    url: (pathname) => new URL(pathname, origin).href,
    counts,
    requests,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
