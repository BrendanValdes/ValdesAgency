#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

const MAX_TEXT_BYTES = 10 * 1024 * 1024;
const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "utf8");
const DATABASE_PATH_PATTERN = /(?:\.(?:db|sqlite|sqlite3)(?:-(?:wal|shm))?|-(?:wal|shm))$/i;
const RAW_PROVIDER_PATH_PATTERN =
  /(?:^|\/)(?:raw[-_]?provider(?:[-_]?responses?)?|provider[-_]?responses?|raw\/providers?|providers?\/[^/]+\/(?:raw\/)?responses?)(?:\/|$)/i;
const RAW_PAGE_PATH_PATTERN =
  /(?:^|\/)(?:raw[-_]?(?:website[-_]?)?pages?|crawled[-_]?pages?|raw\/pages)(?:\/|$)/i;
const EXPORT_PATH_PATTERN =
  /(?:^|\/)(?:exports?|generated[-_]?exports?|lead[-_]?exports?)(?:\/|$)|(?:^|\/)(?:leads?|prospects?)[-_.](?:export|output)(?:[-_.\/]|$)/i;
const PRIVATE_BENCHMARK_PATH_PATTERN =
  /(?:^|\/)benchmarks?\/private(?:\/|$)|(?:^|\/)private[-_]?benchmarks?(?:\/|$)/i;
const LEAD_ARTIFACT_PATH_PATTERN =
  /(?:^|\/)(?:lead-engine|leads?|prospects?|contacts?|enrichment)(?:\/|[-_.]|$)/i;
const HIGH_RISK_IGNORED_PATH_PATTERN =
  /(?:lead-engine|raw[-_]?provider|provider[-_]?responses?|raw[-_]?(?:website[-_]?)?pages?|crawled[-_]?pages?|exports?|benchmarks?\/private|\.lead-engine|\.env(?:\.[^/]*)?|credentials?|secrets?|\.(?:db|sqlite|sqlite3)(?:-(?:wal|shm))?|-(?:wal|shm))(?:\/|$)/i;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN =
  /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-])\d{3}[\s.-]\d{4}\b/g;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|auth[_-]?token|password|passwd|private[_-]?key)\b\s*["']?\s*[:=]\s*["'`]?([A-Za-z0-9][A-Za-z0-9_./+=:@-]{7,})/gi;
const PRIVATE_KEY_PATTERN =
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/;
const BEARER_CREDENTIAL_PATTERN =
  /\bauthorization\s*:\s*bearer\s+([A-Za-z0-9][A-Za-z0-9._~+/=-]{11,})/i;
const HIGH_CONFIDENCE_TOKEN_PATTERNS = [
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/,
];

const IDENTITY_KEYS = new Set([
  "business",
  "business_name",
  "company",
  "company_name",
  "lead",
  "lead_name",
  "organization",
  "organization_name",
]);
const CONTACT_KEYS = new Set([
  "address",
  "contact",
  "contact_name",
  "domain",
  "email",
  "owner",
  "owner_name",
  "phone",
  "street",
  "telephone",
  "website",
]);

function usage(message) {
  if (message) {
    console.error(message);
  }
  console.error(
    "Usage: node bot/scripts/check-lead-artifacts.mjs --check [path ...]",
  );
  process.exit(2);
}

function git(args, repositoryRoot) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function splitNull(buffer) {
  return buffer
    .toString("utf8")
    .split("\0")
    .filter((value) => value.length > 0);
}

function slashPath(value) {
  return value.split(path.sep).join("/");
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function displayPath(repositoryRoot, absolutePath) {
  if (isInside(repositoryRoot, absolutePath)) {
    return slashPath(path.relative(repositoryRoot, absolutePath));
  }
  return slashPath(absolutePath);
}

function walk(entry, files) {
  let stat;
  try {
    stat = lstatSync(entry);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }
    throw error;
  }

  if (stat.isSymbolicLink() || stat.isFile()) {
    files.add(path.resolve(entry));
    return;
  }

  if (!stat.isDirectory()) {
    return;
  }

  for (const child of readdirSync(entry, { withFileTypes: true })) {
    if (child.name === ".git" || child.name === "node_modules") {
      continue;
    }
    walk(path.join(entry, child.name), files);
  }
}

function collectDefaultFiles(repositoryRoot) {
  const relativeEntries = new Set([
    ...splitNull(
      git(
        ["diff", "--name-only", "--diff-filter=ACMR", "-z", "HEAD", "--"],
        repositoryRoot,
      ),
    ),
    ...splitNull(
      git(
        ["ls-files", "--others", "--exclude-standard", "-z", "--"],
        repositoryRoot,
      ),
    ),
  ]);

  const ignoredEntries = splitNull(
    git(
      [
        "ls-files",
        "--others",
        "--ignored",
        "--exclude-standard",
        "--directory",
        "-z",
        "--",
      ],
      repositoryRoot,
    ),
  ).filter((entry) => HIGH_RISK_IGNORED_PATH_PATTERN.test(slashPath(entry)));

  const files = new Set();
  for (const entry of [...relativeEntries, ...ignoredEntries]) {
    const absolutePath = path.resolve(repositoryRoot, entry);
    if (!isInside(repositoryRoot, absolutePath)) {
      throw new Error(`Refusing to inspect a repository path outside the root: ${entry}`);
    }
    walk(absolutePath, files);
  }
  return files;
}

function collectExplicitFiles(entries) {
  const files = new Set();
  for (const entry of entries) {
    const absolutePath = path.resolve(process.cwd(), entry);
    try {
      lstatSync(absolutePath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new Error(`Explicit path does not exist: ${entry}`);
      }
      throw error;
    }
    walk(absolutePath, files);
  }
  return files;
}

function isClearlySyntheticFixture(filePath, text) {
  const normalizedPath = slashPath(filePath).toLowerCase();
  const fixturePath = /(?:^|\/)(?:fixtures?|test[-_]?data)(?:\/|$)/.test(
    normalizedPath,
  );
  const syntheticPath = /(?:^|\/|[-_.])synthetic(?:\/|[-_.]|$)/.test(
    normalizedPath,
  );
  const syntheticMarker =
    /(?:"synthetic"\s*:\s*true|synthetic[-_ ]fixture\s*[:=]\s*true|fixture[-_ ]kind\s*[:=]\s*["']?synthetic)/i.test(
      text,
    );
  return fixturePath && (syntheticPath || syntheticMarker);
}

function isApprovedSchemaOrConfigExample(filePath) {
  const normalizedPath = slashPath(filePath).toLowerCase();
  if (/(?:^|\/)schemas?(?:\/|$)|\.schema\.json$/.test(normalizedPath)) {
    return true;
  }
  return (
    /(?:^|\/)(?:config|configuration)(?:\/|$)/.test(normalizedPath) &&
    /(?:^|\/|[-_.])(?:example|sample|template)(?:\/|[-_.]|$)/.test(
      normalizedPath,
    )
  );
}

function isPlaceholderSecret(value) {
  return /(?:example|placeholder|replace|redacted|dummy|synthetic|test|change[-_]?me|none|null|^\$\{|^<)/i.test(
    value,
  );
}

function isSafeEmail(value) {
  const lower = value.toLowerCase();
  const domain = lower.split("@").at(-1) ?? "";
  return (
    lower.includes("redacted") ||
    ["example.com", "example.net", "example.org"].includes(domain) ||
    domain.endsWith(".example") ||
    domain.endsWith(".invalid") ||
    domain.endsWith(".test")
  );
}

function isSafePhone(value) {
  const digits = value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (/^(\d)\1{9}$/.test(digits)) {
    return true;
  }
  if (digits.length !== 10 || digits.slice(3, 6) !== "555") {
    return false;
  }
  const lineNumber = Number(digits.slice(6));
  return lineNumber >= 100 && lineNumber <= 199;
}

function isPlaceholderValue(value) {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  return (
    trimmed === "" ||
    /^(?:null|none|n\/a|na|unknown|not[-_ ]found|redacted(?:[-_ ].*)?|\[redacted\]|<redacted>|-+)$/i.test(
      trimmed,
    ) ||
    /^\$\{[^}]+\}$/.test(trimmed) ||
    /^<[^>]+>$/.test(trimmed) ||
    isSafeEmail(trimmed) ||
    isSafePhone(trimmed)
  );
}

function normalizeKey(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsvRow(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function csvLooksLikeLeadRecords(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return false;
  }
  const headers = parseCsvRow(lines[0]).map(normalizeKey);
  const hasIdentity = headers.some((key) => IDENTITY_KEYS.has(key));
  const contactIndexes = headers
    .map((key, index) => (CONTACT_KEYS.has(key) ? index : -1))
    .filter((index) => index >= 0);
  if (!hasIdentity || contactIndexes.length === 0) {
    return false;
  }
  return lines.slice(1).some((line) => {
    const values = parseCsvRow(line);
    return contactIndexes.some((index) => !isPlaceholderValue(values[index]));
  });
}

function objectLooksLikeLeadRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const entries = Object.entries(value).map(([key, entryValue]) => [
    normalizeKey(key),
    entryValue,
  ]);
  const hasIdentity = entries.some(
    ([key, entryValue]) => IDENTITY_KEYS.has(key) && !isPlaceholderValue(entryValue),
  );
  const hasMaterialContact = entries.some(
    ([key, entryValue]) => CONTACT_KEYS.has(key) && !isPlaceholderValue(entryValue),
  );
  return hasIdentity && hasMaterialContact;
}

function jsonContainsLeadRecord(value) {
  if (objectLooksLikeLeadRecord(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some(jsonContainsLeadRecord);
  }
  if (value && typeof value === "object") {
    return Object.values(value).some(jsonContainsLeadRecord);
  }
  return false;
}

function jsonTextLooksLikeLeadRecords(text, jsonLines) {
  try {
    if (jsonLines) {
      return text
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .some((line) => jsonContainsLeadRecord(JSON.parse(line)));
    }
    return jsonContainsLeadRecord(JSON.parse(text));
  } catch {
    const identityPair =
      /["'](?:business(?:_name)?|company(?:_name)?|lead(?:_name)?|organization(?:_name)?)["']\s*:\s*["'][^"']{2,}["']/i.test(
        text,
      );
    const contactPair =
      /["'](?:owner(?:_name)?|contact(?:_name)?|email|phone|address|street|website|domain)["']\s*:\s*["'][^"']{2,}["']/i.test(
        text,
      );
    return identityPair && contactPair;
  }
}

function markdownLooksLikeLeadTable(text) {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length - 2; index += 1) {
    const header = lines[index];
    const divider = lines[index + 1];
    if (!header.includes("|") || !/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+/.test(divider)) {
      continue;
    }
    const headers = header
      .split("|")
      .map(normalizeKey)
      .filter(Boolean);
    if (
      !headers.some((key) => IDENTITY_KEYS.has(key)) ||
      !headers.some((key) => CONTACT_KEYS.has(key))
    ) {
      continue;
    }
    const firstRecord = lines[index + 2]
      .split("|")
      .map((value) => value.trim())
      .filter(Boolean);
    if (firstRecord.some((value) => !isPlaceholderValue(value))) {
      return true;
    }
  }
  return false;
}

function keyValueTextLooksLikeContactRecord(text) {
  let hasIdentity = false;
  let hasMaterialContact = false;
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^\s*["']?([A-Za-z][A-Za-z0-9_. -]{0,48})["']?\s*[:=]\s*(.+?)\s*,?\s*$/,
    );
    if (!match) {
      continue;
    }
    const key = normalizeKey(match[1]);
    const value = match[2]
      .trim()
      .replace(/,$/, "")
      .replace(/^(["'])(.*)\1$/, "$2");
    if (IDENTITY_KEYS.has(key) && !isPlaceholderValue(value)) {
      hasIdentity = true;
    }
    if (CONTACT_KEYS.has(key) && !isPlaceholderValue(value)) {
      hasMaterialContact = true;
    }
  }
  return hasIdentity && hasMaterialContact;
}

function inspectText(filePath, text, violations) {
  const normalizedPath = slashPath(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const syntheticFixture = isClearlySyntheticFixture(normalizedPath, text);
  const approvedExample = isApprovedSchemaOrConfigExample(normalizedPath);

  if (!syntheticFixture) {
    if (RAW_PROVIDER_PATH_PATTERN.test(normalizedPath)) {
      violations.push("raw provider response path");
    }
    if (RAW_PAGE_PATH_PATTERN.test(normalizedPath)) {
      violations.push("raw crawled-page path");
    }
    if (EXPORT_PATH_PATTERN.test(normalizedPath)) {
      violations.push("generated lead export path");
    }
    if (PRIVATE_BENCHMARK_PATH_PATTERN.test(normalizedPath)) {
      violations.push("private benchmark dataset path");
    }
    if (
      [".htm", ".html"].includes(extension) &&
      LEAD_ARTIFACT_PATH_PATTERN.test(normalizedPath)
    ) {
      violations.push("raw crawled-page content");
    }
    if (
      LEAD_ARTIFACT_PATH_PATTERN.test(normalizedPath) &&
      /["'](?:raw_response|provider_response|provider_payload)["']\s*:/i.test(
        text,
      )
    ) {
      violations.push("raw provider response content");
    }
  }

  for (const match of text.matchAll(EMAIL_PATTERN)) {
    if (!isSafeEmail(match[0])) {
      violations.push("email address");
      break;
    }
  }

  for (const match of text.matchAll(PHONE_PATTERN)) {
    if (!isSafePhone(match[0])) {
      violations.push("phone number");
      break;
    }
  }

  for (const match of text.matchAll(SECRET_ASSIGNMENT_PATTERN)) {
    if (!isPlaceholderSecret(match[1])) {
      violations.push("credential assignment");
      break;
    }
  }

  const bearerCredential = text.match(BEARER_CREDENTIAL_PATTERN)?.[1];
  if (bearerCredential && !isPlaceholderSecret(bearerCredential)) {
    violations.push("bearer credential");
  }

  if (PRIVATE_KEY_PATTERN.test(text)) {
    violations.push("private key");
  }
  for (const pattern of HIGH_CONFIDENCE_TOKEN_PATTERNS) {
    if (pattern.test(text)) {
      violations.push("high-confidence access token");
      break;
    }
  }

  if (syntheticFixture || approvedExample) {
    return;
  }

  if (keyValueTextLooksLikeContactRecord(text)) {
    violations.push("contact record");
  } else if (extension === ".csv" && csvLooksLikeLeadRecords(text)) {
    violations.push("lead-like CSV records");
  } else if (
    extension === ".json" &&
    jsonTextLooksLikeLeadRecords(text, false)
  ) {
    violations.push("lead-like JSON records");
  } else if (
    extension === ".jsonl" &&
    jsonTextLooksLikeLeadRecords(text, true)
  ) {
    violations.push("lead-like JSONL records");
  } else if (
    [".md", ".markdown"].includes(extension) &&
    markdownLooksLikeLeadTable(text)
  ) {
    violations.push("lead-like Markdown records");
  }
}

function inspectFile(repositoryRoot, filePath) {
  const label = displayPath(repositoryRoot, filePath);
  const violations = [];
  const stat = lstatSync(filePath);
  const normalizedPath = slashPath(filePath);

  if (stat.isSymbolicLink()) {
    if (
      LEAD_ARTIFACT_PATH_PATTERN.test(normalizedPath) ||
      HIGH_RISK_IGNORED_PATH_PATTERN.test(normalizedPath)
    ) {
      violations.push("lead-artifact symbolic link");
    }
    return { label, violations };
  }

  const buffer = readFileSync(filePath);
  if (
    DATABASE_PATH_PATTERN.test(normalizedPath) ||
    buffer.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER)
  ) {
    violations.push("SQLite/database artifact");
    return { label, violations };
  }

  if (buffer.includes(0)) {
    if (LEAD_ARTIFACT_PATH_PATTERN.test(normalizedPath)) {
      violations.push("binary lead artifact");
    }
    return { label, violations };
  }

  if (buffer.length > MAX_TEXT_BYTES) {
    if (LEAD_ARTIFACT_PATH_PATTERN.test(normalizedPath)) {
      violations.push("oversized lead artifact");
    }
    return { label, violations };
  }

  inspectText(filePath, buffer.toString("utf8"), violations);
  return { label, violations: [...new Set(violations)] };
}

const argumentsAfterNode = process.argv.slice(2);
const checkIndex = argumentsAfterNode.indexOf("--check");
if (checkIndex === -1) {
  usage("Missing required --check flag.");
}
const explicitEntries = argumentsAfterNode.slice(checkIndex + 1);
if (explicitEntries.some((entry) => entry.startsWith("--"))) {
  usage("Unknown option.");
}

let repositoryRoot;
try {
  repositoryRoot = realpathSync(
    execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim(),
  );
} catch {
  usage("Run the artifact guard from inside a Git worktree.");
}

let files;
try {
  files =
    explicitEntries.length > 0
      ? collectExplicitFiles(explicitEntries)
      : collectDefaultFiles(repositoryRoot);
} catch (error) {
  console.error(`Lead artifact guard could not collect files: ${error.message}`);
  process.exit(2);
}

const findings = [];
for (const filePath of [...files].sort()) {
  const result = inspectFile(repositoryRoot, filePath);
  if (result.violations.length > 0) {
    findings.push(result);
  }
}

if (findings.length > 0) {
  console.error("Lead artifact guard failed:");
  for (const finding of findings) {
    console.error(`- ${finding.label}: ${finding.violations.join(", ")}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Lead artifact guard passed (${files.size} file(s) checked).`);
}
