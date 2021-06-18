const $loading = document.querySelector<HTMLDivElement>('#loading-spinner');
const $loadingProgressText = document.querySelector<HTMLDivElement>(
    '#loading-spinner-progress-text'
);

const $steps = Array.from(document.querySelector<HTMLOListElement>('#steps').children);
let stepIndex = 0;
export const hideStepsAfter = (after: number) => {
    stepIndex = after;
    $steps.forEach(($s, idx) => {
        if (idx > after) {
            ($s as HTMLLIElement).style.display = 'none';
        }
    });
};
export const showNextStep = () => {
    ($steps[++stepIndex] as HTMLLIElement).style.display = 'list-item';
};

let inProcessing = false;
let inError = false;
export const showLoader = () => {
    inProcessing = true;
    inError = false;
    $loading.style.display = 'inline-block';
    $loadingProgressText.style.display = 'block';
    setLoadingStage('');
};
let stage = '';
const progressByIndex: Map<number, { stage: string; message: string }> = new Map();
const updateProgressText = () => {
    const keys = Array.from(progressByIndex.keys()).sort();
    let text = '';
    for (const k of keys) {
        const { stage, message } = progressByIndex.get(k)!;
        text += `(Job ${k + 1}/${keys.length}) ${stage}`;
        if (message.length > 0) {
            text += `: ${message}`;
        }
        text += '<br>';
    }
    $loadingProgressText.innerHTML = text;
};
export const setLoadingStage = (text: string, index?: number) => {
    if (index == null) {
        progressByIndex.clear();
        stage = text;
        $loadingProgressText.innerHTML = text;
    } else {
        progressByIndex.set(index, { stage: text, message: '' });
        updateProgressText();
    }
};
export const setLoadingText = (text: string, index?: number) => {
    if (index == null) {
        $loadingProgressText.innerHTML = `${stage}: ${text}`;
        inError = false;
    } else {
        if (progressByIndex.has(index)) {
            const { stage } = progressByIndex.get(index);
            progressByIndex.set(index, { stage, message: text });
        } else {
            progressByIndex.set(index, { stage: '', message: text });
        }
        updateProgressText();
    }
};
export const setError = (err: Error | string, note?: string) => {
    showLoader();
    $loadingProgressText.innerText = `Error: ${(err as Error).message || err}`;
    if (note != null) {
        $loadingProgressText.innerText += `\nNote: ${note}`;
    }
    inError = true;
};
export const hideLoader = () => {
    inProcessing = false;
    if (!inError) {
        $loading.style.display = 'none';
        $loadingProgressText.style.display = 'none';
        setLoadingStage('');
    }
};

export const isProcessing = () => {
    return inProcessing;
};
export const currentStepIndex = () => {
    return stepIndex;
};
