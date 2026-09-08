import { flushSync } from 'react-dom';
import type { AssistantField, FieldChange } from '../types/operator-assistant.js';

type Editable = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
interface CapturedField {
  element: Editable;
  label: string;
  type: string;
  value: string;
}
export interface FormSnapshot {
  screenId: string;
  fields: AssistantField[];
  entries: Map<string, CapturedField>;
}
const excluded = /password|secret|token|api.?key|otp|totp|كلمة.?المرور|مفتاح.?الخدمة/i;
function labelOf(element: Editable): string {
  const cleanLabel = (label: Element) => {
    const copy = label.cloneNode(true) as Element;
    copy.querySelectorAll('input, select, textarea, button').forEach((child) => child.remove());
    return copy.textContent?.trim() || '';
  };
  const nearby = element.parentElement?.querySelector('label');
  const explicit =
    element.getAttribute('aria-label') ||
    [...(element.labels || [])].map(cleanLabel).filter(Boolean).join(' ') ||
    (nearby ? cleanLabel(nearby) : '');
  return (
    explicit ||
    element.getAttribute('placeholder') ||
    element.getAttribute('name') ||
    element.id ||
    'حقل إدخال'
  ).slice(0, 100);
}
function eligible(element: Editable, root: HTMLElement): boolean {
  if (
    !element.closest('[data-assistant-draft]') ||
    !root.contains(element) ||
    element.closest('[data-assistant-ignore]') ||
    element.disabled ||
    element.matches(':disabled') ||
    element.closest('[aria-hidden="true"], [hidden]')
  )
    return false;
  if ('readOnly' in element && element.readOnly) return false;
  const type = element instanceof HTMLInputElement ? element.type : element.tagName.toLowerCase();
  if (
    ![
      'text',
      'search',
      'number',
      'date',
      'datetime-local',
      'time',
      'month',
      'week',
      'email',
      'tel',
      'url',
      'textarea',
      'select',
    ].includes(type)
  )
    return false;
  if (
    excluded.test(
      `${element.name} ${element.id} ${labelOf(element)} ${element.getAttribute('autocomplete') || ''}`
    )
  )
    return false;
  if (
    typeof element.checkVisibility === 'function' &&
    !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
  )
    return false;
  return element.getClientRects().length > 0;
}
export function captureAssistantForm(root: HTMLElement, fallbackScreen: string): FormSnapshot {
  const entries = new Map<string, CapturedField>();
  const markers = [...root.querySelectorAll<HTMLElement>('[data-assistant-screen]')];
  const screenId =
    markers.filter((element) => element.getClientRects().length).slice(-1)[0]?.dataset
      .assistantScreen || fallbackScreen;
  for (const element of root.querySelectorAll<Editable>('input, textarea, select')) {
    if (entries.size >= 40 || !eligible(element, root)) continue;
    const id = `field-${entries.size + 1}`;
    entries.set(id, {
      element,
      label: labelOf(element),
      type: element instanceof HTMLInputElement ? element.type : element.tagName.toLowerCase(),
      value: element.value,
    });
  }
  return {
    screenId,
    entries,
    fields: [...entries].map(([id, field]) => ({ id, label: field.label, type: field.type })),
  };
}
export function previewAssistantFields(snapshot: FormSnapshot, changes: FieldChange[]) {
  const seen = new Set<string>();
  return changes.map((change) => {
    const field = snapshot.entries.get(change.id);
    if (!field || seen.has(change.id)) throw new Error('المسودة تشير إلى حقل غير موجود أو مكرر.');
    seen.add(change.id);
    return { ...change, label: field.label };
  });
}
/** Only fills the reviewed controls. Never clicks buttons, submits forms, or calls a save API. */
export function applyAssistantFields(
  root: HTMLElement,
  snapshot: FormSnapshot,
  changes: FieldChange[]
): void {
  if (!changes.length) throw new Error('لا توجد حقول للمراجعة.');
  previewAssistantFields(snapshot, changes);
  const resolved = changes.map((change) => {
    const field = snapshot.entries.get(change.id);
    if (!field) throw new Error('الحقل غير موجود.');
    const element = field.element;
    if (
      !element.isConnected ||
      !eligible(element, root) ||
      element.value !== field.value ||
      labelOf(element) !== field.label
    ) {
      throw new Error('تغيّر النموذج أو أحد الحقول منذ الإملاء. أعد تجهيز المسودة لحماية بياناتك.');
    }
    let value = change.value;
    if (value.length > 6000) throw new Error('قيمة الحقل أطول من الحد المسموح.');
    if (element instanceof HTMLSelectElement) {
      const options = [...element.options].filter(
        (option) =>
          !option.disabled &&
          (option.value === value ||
            option.text.trim() === value.trim() ||
            (/^\d{1,20}$/.test(value) && option.text.trim().split(/\s+[-–—]\s+/)[0] === value))
      );
      if (options.length !== 1)
        throw new Error(`اختر قيمة «${field.label}» بنفسك؛ لم نجد اختياراً مطابقاً وحيداً.`);
      value = options[0].value;
    } else {
      if (element.maxLength >= 0 && value.length > element.maxLength)
        throw new Error(`قيمة «${field.label}» تتجاوز طول الحقل.`);
      if (field.type === 'number' && (value.trim() === '' || !Number.isFinite(Number(value))))
        throw new Error(`راجع الرقم في «${field.label}».`);
      if (
        field.type === 'date' &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          !Number.isFinite(Date.parse(value)) ||
          new Date(value).toISOString().slice(0, 10) !== value)
      )
        throw new Error(`استخدم تاريخاً صحيحاً في «${field.label}».`);
      if (element instanceof HTMLInputElement) {
        const probe = element.cloneNode(false) as HTMLInputElement;
        probe.value = value;
        if ((value && !probe.value) || !probe.validity.valid)
          throw new Error(`راجع نوع القيمة وحدودها في «${field.label}».`);
      }
    }
    return { element, value };
  });
  // Validate the complete set before touching any field. React remains the owner of form state.
  for (const { element, value } of resolved) {
    const prototype =
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    if (!element.isConnected || !eligible(element, root))
      throw new Error(
        'تغيّر تركيب النموذج أثناء التعبئة؛ راجع الحقول التي عُبئت وأكمل البقية يدوياً. لم يُحفظ سجل.'
      );
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (!setter) throw new Error('هذا الحقل لا يدعم التعبئة الآمنة.');
    flushSync(() => {
      setter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  const adjusted = resolved.some(({ element, value }) => {
    if (!element.isConnected) return true;
    if (
      element instanceof HTMLInputElement &&
      element.type === 'number' &&
      value.trim() &&
      element.value.trim()
    ) {
      return Number(element.value) !== Number(value);
    }
    return element.value !== value;
  });
  if (adjusted)
    throw new Error(
      'قواعد النموذج عدّلت بعض القيم أثناء التعبئة. راجع الحقول وأكملها يدوياً؛ لم يُحفظ أي سجل.'
    );
}
