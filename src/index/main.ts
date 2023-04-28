import {
    buildHyperlapse,
    fetchMetadata,
    loadGMapsRoute,
    server,
} from '../common/socket-client';
import { ClientCalls, TFetchMetadataOutput } from '../rpcCalls';
import { loadRoute } from './rwgps';
import {
    setLoadingText,
    setLoadingStage,
    hideLoader,
    showLoader,
    showNextStep,
    isProcessing,
    hideStepsAfter,
    currentStepIndex,
    setError,
} from './steps';
import { getStravaResult, loadActivity } from './strava';

declare const plausible: any;
declare const Gmdp: any;

async function withProgress<O>(f: () => Promise<O>): Promise<O> {
    const disposable = server.register(ClientCalls.ReceiveProgress, async (msg) => {
        if (msg.type === 'PROGRESS') {
            setLoadingText(msg.message, msg.index);
        } else {
            setLoadingStage(msg.stage, msg.index);
        }
        return null;
    });
    try {
        return await f();
    } finally {
        hideLoader();
        disposable.dispose();
    }
}

async function catchWithProgress<O>(
    f: () => Promise<O>,
    note?: string,
    logEvent?: string
): Promise<O> {
    try {
        return await withProgress(f);
    } catch (e) {
        setError(e, note);
        if (logEvent != null) {
            plausible(logEvent, { props: { message: (e as Error).message || e } });
        }
    }
}

const $exampleLink = document.querySelector<HTMLAnchorElement>('#example');
let exampleClicked = false;
let exampleText = $exampleLink.textContent;
$exampleLink.addEventListener('click', () => {
    if (exampleClicked) {
        // hide example
        $exampleLink.innerHTML = exampleText;
    } else {
        // show example
        $exampleLink.innerHTML =
            '(click to dismiss) <img src="https://raw.githubusercontent.com/pelmers/streetwarp-cli/master/res/example.gif">';
    }
    exampleClicked = !exampleClicked;
});
document
    .querySelector<HTMLImageElement>('#logo')
    .addEventListener(
        'click',
        () => (window.location.href = 'https://streetwarp.com/')
    );

// STEP 1: GET GPX FILE DATA
const $stravaLogoButton = document.querySelector<HTMLButtonElement>('#strava-button');
const $rwgpsLogoButton = document.querySelector<HTMLButtonElement>('#rwgps-button');
const $gmapsLogoButton = document.querySelector<HTMLButtonElement>('#gmaps-button');
const $stravaError = document.querySelector<HTMLDivElement>('#strava-error');
const $stravaName = document.querySelector<HTMLSpanElement>('#strava-name');
const $stravaProfile = document.querySelector<HTMLImageElement>('#strava-profile');
const $stravaConnected = document.querySelector<HTMLDivElement>('#strava-connected');
const $stravaActivityInput = document.querySelector<HTMLInputElement>(
    '#strava-activity-input'
);
const $stravaActivityButton = document.querySelector<HTMLButtonElement>(
    '#strava-activity-button'
);
let stravaAccessToken: string;
getStravaResult((e) => {
    $stravaError.textContent =
        'Error connecting to Strava, click the button again (details in console)';
    console.error('Strava error', e);
    $stravaError.style.display = 'inline-block';
}).then(({ result }) => {
    if ('requestURL' in result) {
        $stravaLogoButton.addEventListener(
            'click',
            () => (window.location.href = result.requestURL)
        );
    } else {
        stravaAccessToken = result.profile.token;
        $stravaLogoButton.style.display = 'none';
        $rwgpsLogoButton.style.display = 'none';
        $gmapsLogoButton.style.display = 'none';
        $stravaName.textContent = result.profile.name;
        $stravaProfile.src = result.profile.profileURL;
        $stravaConnected.style.display = 'inline-block';
        document.querySelector<HTMLHeadingElement>('#gpx-step-header').style.display =
            'none';
        document.querySelector<HTMLDivElement>('#gpx-step-contents').style.display =
            'none';
        document.querySelector<HTMLHeadingElement>(
            '#strava-activity-text'
        ).style.display = 'inline-block';
        $stravaActivityButton.style.display = 'inline-block';
        $stravaActivityInput.style.display = 'inline-block';
        $stravaActivityInput.addEventListener(
            'keypress',
            (ev) => ev.code === 'Enter' && $stravaActivityButton.click()
        );
    }
});

let jsonContents: string;
$stravaActivityButton.addEventListener('click', async () => {
    if (isProcessing()) {
        return;
    }
    hideStepsAfter(0);
    setLoadingStage('Loading Activity');
    showLoader();
    const { name, km, points } = await catchWithProgress(() =>
        loadActivity($stravaActivityInput.value, stravaAccessToken)
    );
    jsonContents = points;
    document.querySelector<HTMLHeadingElement>(
        '#strava-activity-text'
    ).textContent = `${name}: ${km.toFixed(2)} km`;
    $stravaActivityButton.style.display = 'none';
    $stravaActivityInput.style.display = 'none';
    showNextStep();
    plausible('loaded-activity', { props: { type: 'strava' } });
});

const $rwgpsActivityInput = document.querySelector<HTMLInputElement>(
    '#rwgps-activity-input'
);
const $rwgpsActivityButton = document.querySelector<HTMLButtonElement>(
    '#rwgps-activity-button'
);
$rwgpsLogoButton.addEventListener('click', () => {
    $stravaLogoButton.style.display = 'none';
    $stravaError.style.display = 'none';
    $rwgpsLogoButton.style.display = 'none';
    $gmapsLogoButton.style.display = 'none';
    document.querySelector<HTMLHeadingElement>('#gpx-step-header').style.display =
        'none';
    document.querySelector<HTMLDivElement>('#gpx-step-contents').style.display = 'none';
    document.querySelector<HTMLHeadingElement>('#rwgps-activity-text').style.display =
        'inline-block';
    $rwgpsActivityButton.style.display = 'inline-block';
    $rwgpsActivityInput.style.display = 'inline-block';
    $rwgpsActivityInput.addEventListener(
        'keypress',
        (ev) => ev.code === 'Enter' && $rwgpsActivityButton.click()
    );
});
$rwgpsActivityButton.addEventListener('click', async () => {
    setLoadingStage('Loading Route');
    showLoader();
    const { name, km, points } = await catchWithProgress(() =>
        loadRoute($rwgpsActivityInput.value)
    );
    jsonContents = points;
    document.querySelector<HTMLHeadingElement>(
        '#rwgps-activity-text'
    ).textContent = `${name}: ${km.toFixed(2)} km`;
    $rwgpsActivityButton.style.display = 'none';
    $rwgpsActivityInput.style.display = 'none';
    showNextStep();
    plausible('loaded-activity', { props: { type: 'rwgps' } });
});

const $gmapsDirectionsInput = document.querySelector<HTMLInputElement>(
    '#gmaps-directions-input'
);
const $gmapsDirectionsButton = document.querySelector<HTMLButtonElement>(
    '#gmaps-directions-button'
);
$gmapsLogoButton.addEventListener('click', () => {
    $stravaLogoButton.style.display = 'none';
    $stravaError.style.display = 'none';
    $rwgpsLogoButton.style.display = 'none';
    $gmapsLogoButton.style.display = 'none';
    document.querySelector<HTMLHeadingElement>('#gpx-step-header').style.display =
        'none';
    document.querySelector<HTMLDivElement>('#gpx-step-contents').style.display = 'none';
    document.querySelector<HTMLHeadingElement>('#gmaps-directions-text').style.display =
        'inline-block';
    $gmapsDirectionsButton.style.display = 'inline-block';
    $gmapsDirectionsInput.style.display = 'inline-block';
    $gmapsDirectionsInput.addEventListener(
        'keypress',
        (ev) => ev.code === 'Enter' && $gmapsDirectionsButton.click()
    );
});
$gmapsDirectionsButton.addEventListener('click', async () => {
    setLoadingStage('Loading Route from directions');
    showLoader();
    const { name, km, points } = await catchWithProgress(() => {
        const url = $gmapsDirectionsInput.value;
        const gmdp = new Gmdp(url);
        const { route, transportation } = gmdp.getRoute();
        // map transportation mode from 'car|bike|foot|transit' to 'driving|bicycling|walking|transit'
        const mode =
            transportation != null
                ? transportation
                      .replace('car', 'driving')
                      .replace('bike', 'bicycling')
                      .replace('foot', 'walking')
                : null;
        return loadGMapsRoute({
            waypoints: route.map((p: any) => ({
                lat: Number.parseFloat(p.lat),
                lng: Number.parseFloat(p.lng),
            })),
            mode,
        });
    }, 'are you using "current location"? then this page cannot find it, please use exact location in Google Maps.');
    jsonContents = points;
    document.querySelector<HTMLHeadingElement>(
        '#gmaps-directions-text'
    ).textContent = `${name}: ${km.toFixed(2)} km`;
    $gmapsDirectionsButton.style.display = 'none';
    $gmapsDirectionsInput.style.display = 'none';
    showNextStep();
    plausible('loaded-activity', { props: { type: 'gmaps' } });
});

const $gpxInput = document.querySelector<HTMLInputElement>('#gpx-input');
const $gpxButton = document.querySelector<HTMLButtonElement>('#gpx-button');
const $gpxDragDrop = document.querySelector<HTMLDivElement>('#gpx-dragdrop');
$gpxButton.addEventListener('click', () => $gpxInput.click());
$gpxDragDrop.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
});
$gpxDragDrop.addEventListener('dragexit', (e) => {
    e.preventDefault();
    e.stopPropagation();
});
$gpxDragDrop.addEventListener('drag', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleFiles(e.dataTransfer.files);
});
$gpxInput.addEventListener('change', () => handleFiles($gpxInput.files));
let gpxContents: Promise<string>;
function handleFiles(files: FileList) {
    const file = files[0];
    showNextStep(); // fetch-metadata
    plausible('loaded-activity', { props: { type: 'upload' } });
    // @ts-ignore text does exist on file api
    gpxContents = file.text();
    const mb = file.size / 1000000;
    document.querySelector('#gpx-step-contents').innerHTML = `<b>Selected: ${
        file.name
    }</b> (${mb.toFixed(2)} MB)`;
    document.querySelector<HTMLDivElement>('#gpx-step-contents').style.textAlign =
        'center';
    $stravaLogoButton.style.display = 'none';
    $stravaError.style.display = 'none';
}

// STEP 2: GET FRAME DENSITY AND SEND METADATA REQUEST
const $frameDensityInput = document.querySelector<HTMLInputElement>('#frame-density');
const $frameDensityLabel = document.querySelector<HTMLSpanElement>(
    '#frame-density-label'
);
$frameDensityLabel.textContent = $frameDensityInput.value;
$frameDensityInput.addEventListener('input', () => {
    $frameDensityLabel.textContent = $frameDensityInput.value;
});

const $fetchMetadataButton = document.querySelector<HTMLButtonElement>(
    '#fetch-metadata'
);
let metadataResult: TFetchMetadataOutput;
$fetchMetadataButton.addEventListener('click', async () => {
    if (isProcessing()) {
        // If we're already processing something, ignore the button.
        return;
    }
    hideStepsAfter(1);
    showLoader();
    const input =
        jsonContents != null
            ? { contents: jsonContents, extension: 'json' as const }
            : { contents: await gpxContents, extension: 'gpx' as const };
    metadataResult = await catchWithProgress(
        () =>
            fetchMetadata({
                input,
                // Kilometers to miles
                frameDensity: $frameDensityInput.valueAsNumber * 1.60934,
            }),
        null,
        'fetched-metadata-error'
    );
    populateStats();
    showNextStep();
    plausible('fetched-metadata');
    document.querySelector<HTMLDivElement>('#api-notes').style.display = 'block';
    showNextStep();
    await waitForNextApiKeyChange();
    plausible('got-api-key');
    if (currentStepIndex() === 3) {
        showNextStep();
    }
});

const $gpxStatsList = document.querySelector<HTMLUListElement>('#gpx-stats');
const $costEstimateText = document.querySelector<HTMLSpanElement>('#cost-estimate');
function populateStats() {
    const { frames, distance, averageError } = metadataResult;
    $gpxStatsList.innerHTML = `
    <li>Total distance: <b>${(distance / 1000).toFixed(2)} km</b></li>
    <li>Number of images: <b>${frames}</b> (${(frames / 30).toFixed(2)}s video)</li>
    <li>Average error (between image and GPX locations): <b>${averageError.toFixed(
        2
    )} m</b></li>
    `;
    $costEstimateText.innerText = `$${(frames * 0.007).toFixed(2)}`;
}

// STEP 4: GET GOOGLE API KEY
const $apiKeyInput = document.querySelector<HTMLInputElement>('#api-key-input');
const waitForNextApiKeyChange = async () => {
    if ($apiKeyInput.value !== '') {
        return;
    }
    let listener;
    await new Promise((resolve) => {
        listener = resolve;
        $apiKeyInput.addEventListener('change', listener);
    });
    $apiKeyInput.removeEventListener('change', listener);
    return;
};

// STEP 5: BUILD HYPERLAPSE
const $fastBuildButton = document.querySelector<HTMLButtonElement>('#fast-button');
const $slowBuildButton = document.querySelector<HTMLButtonElement>('#slow-button');
const $optimizeCheckbox = document.querySelector<HTMLInputElement>(
    '#optimize-checkbox'
);

async function validateToken(token: string): Promise<void> {
    const response = await fetch(
        `https://maps.googleapis.com/maps/api/streetview?size=400x400&location=47.5763831,-122.4211769&fov=80&heading=70&pitch=0&key=${token}`
    );
    if (response.status !== 200) {
        const message = await response.text();
        plausible('token-validation-error', { props: { message } });
        throw new Error(
            `Access key validation failed: ${response.status} - ${response.statusText}, ${message}`
        );
    }
    plausible('token-validated');
}

const handleBuildButton = async (mode: string) => {
    if (isProcessing()) {
        return;
    }
    showLoader();
    const apiKey = $apiKeyInput.value;
    try {
        await validateToken(apiKey);
    } catch (e) {
        setError(e);
        return;
    }
    const input = {
        contents: JSON.stringify(metadataResult),
        extension: 'json' as const,
    };
    const result = await catchWithProgress(
        () =>
            buildHyperlapse({
                apiKey,
                input,
                frameDensity: $frameDensityInput.valueAsNumber,
                mode: mode as 'fast' | 'med' | 'slow',
                optimize: $optimizeCheckbox.checked,
            }),
        null,
        'build-hyperlapse-error'
    );
    if (result != null) {
        // STEP 6: SHOW RESULTS
        document.querySelector<HTMLAnchorElement>('#result-anchor').href = result.url;
        plausible('hyperlapse-result', { props: mode });
        showNextStep();
    }
};

$fastBuildButton.addEventListener('click', () => handleBuildButton('fast'));
$slowBuildButton.addEventListener('click', () => handleBuildButton('slow'));
