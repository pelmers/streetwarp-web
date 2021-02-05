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
    $loading.style.display = 'inline-block';
    $loadingProgressText.style.display = 'block';
    setLoadingStage('');
};
let stage = '';
export const setLoadingStage = (text: string) => {
    stage = text;
    $loadingProgressText.innerText = text;
};
export const setLoadingText = (text: string) => {
    $loadingProgressText.innerText = `${stage}: ${text}`;
    inError = false;
};
export const setError = (message: string) => {
    showLoader();
    $loadingProgressText.innerText = `Error: ${message}`;
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
