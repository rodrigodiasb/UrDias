export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function formatDateISO(d = new Date()) {
  // yyyy-mm-dd
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateBR(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateTimeBR(isoDT) {
  // isoDT: yyyy-mm-ddTHH:MM
  if (!isoDT) return "";
  const [date, time] = isoDT.split("T");
  return `${formatDateBR(date)} ${time}`;
}

export function nowLocalISODateTime() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export function onlyDigits(s = "") {
  return String(s).replace(/\D+/g, "");
}

// CPF validation
export function isValidCPF(input) {
  const cpf = onlyDigits(input);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calc = (base) => {
    let sum = 0;
    for (let i = 0; i < base; i++) {
      sum += Number(cpf[i]) * (base + 1 - i);
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const d1 = calc(9);
  const d2 = ((() => {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  })());

  return Number(cpf[9]) === d1 && Number(cpf[10]) === d2;
}

export function maskCPF(input) {
  const cpf = onlyDigits(input).slice(0, 11);
  if (cpf.length <= 3) return cpf;
  if (cpf.length <= 6) return `${cpf.slice(0,3)}.${cpf.slice(3)}`;
  if (cpf.length <= 9) return `${cpf.slice(0,3)}.${cpf.slice(3,6)}.${cpf.slice(6)}`;
  return `${cpf.slice(0,3)}.${cpf.slice(3,6)}.${cpf.slice(6,9)}-${cpf.slice(9,11)}`;
}

export function normalizeForSearch(s = "") {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function debounce(fn, ms = 400) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
