import { json } from 'express';
import { waitForResult } from '../common/socket-client';
import {
    MESSAGE_TYPES,
    Message,
    FetchMetadataResultMessage,
    BuildHyperlapseResultMessage,
    LoadStravaActivityResultMessage,
} from '../messages';
import { getStravaResult } from './strava';

const socket = io();

const send = (msg: Message) => socket.send(msg);

async function waitForResultWithProgress<T>(type: MESSAGE_TYPES): Promise<T> {
    try {
        return await waitForResult<T>(
            socket,
            type,
            ({ message }) => setLoadingText(message),
            ({ stage }) => setLoadingStage(stage)
        );
    } catch (e) {
        setLoadingStage(`Error: ${(e as Error).message}`);
    }
}

const $steps = Array.from(document.querySelector<HTMLOListElement>('#steps').children);
let stepIndex = 0;
const hideStepsAfter = (after: number) => {
    stepIndex = after;
    $steps.forEach(($s, idx) => {
        if (idx > after) {
            ($s as HTMLLIElement).style.display = 'none';
        }
    });
};
const showNextStep = () => {
    ($steps[++stepIndex] as HTMLLIElement).style.display = 'list-item';
};

const $exampleLink = document.querySelector<HTMLAnchorElement>('#example');
let exampleClicked = false;
$exampleLink.addEventListener('click', () => {
    if (exampleClicked) {
        // hide example
        $exampleLink.innerHTML = '(see example)';
    } else {
        // show example
        $exampleLink.innerHTML =
            '(click to dismiss) <img src="https://raw.githubusercontent.com/pelmers/streetwarp-cli/master/res/example.gif">';
    }
    exampleClicked = !exampleClicked;
});

const $loading = document.querySelector<HTMLDivElement>('#loading-spinner');
const $loadingProgressText = document.querySelector<HTMLDivElement>(
    '#loading-spinner-progress-text'
);
let inProcessing = false;
const showLoader = () => {
    inProcessing = true;
    $loading.style.display = 'inline-block';
    $loadingProgressText.style.display = 'block';
    setLoadingStage('');
};
let stage = '';
const setLoadingStage = (text: string) => {
    stage = text;
    $loadingProgressText.innerText = text;
};
const setLoadingText = (text: string) => {
    $loadingProgressText.innerText = `${stage}: ${text}`;
};
const hideLoader = () => {
    inProcessing = false;
    $loading.style.display = 'none';
    $loadingProgressText.style.display = 'none';
    setLoadingStage('');
};

// STEP 1: GET GPX FILE DATA
const $stravaButton = document.querySelector<HTMLButtonElement>('#strava-button');
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
getStravaResult(socket, (e) => {
    $stravaError.textContent =
        'Error connecting to Strava, click the button again (details in console)';
    console.error('Strava error', e);
    $stravaError.style.display = 'inline-block';
}).then(({ result }) => {
    if ('requestURL' in result) {
        $stravaButton.addEventListener(
            'click',
            () => (window.location.href = result.requestURL)
        );
    } else {
        stravaAccessToken = result.profile.token;
        $stravaButton.style.display = 'none';
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
    if (inProcessing) {
        return;
    }
    hideStepsAfter(0);
    setLoadingStage('Loading Activity');
    showLoader();
    const idRegex = /\/(\d+)/;
    const match = idRegex.exec($stravaActivityInput.value)[1];
    try {
        if (!match) {
            throw new Error('no match for id in URL');
        }
        send({
            type: MESSAGE_TYPES.LOAD_STRAVA_ACTIVITY,
            id: Number.parseInt(match),
            token: stravaAccessToken,
        });
    } catch (e) {
        setLoadingStage(`Could not parse activity id: ${e.message}`);
    }
    const { name, km, points } = await waitForResultWithProgress<
        LoadStravaActivityResultMessage
    >(MESSAGE_TYPES.LOAD_STRAVA_ACTIVITY_RESULT);
    hideLoader();
    // TODO show the activity name/distance here
    jsonContents = points;
    document.querySelector<HTMLHeadingElement>(
        '#strava-activity-text'
    ).textContent = `${name}: ${km.toFixed(2)} km`;
    $stravaActivityButton.style.display = 'none';
    $stravaActivityInput.style.display = 'none';
    showNextStep();
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
    // @ts-ignore text does exist on file api
    gpxContents = file.text();
    const mb = file.size / 1000000;
    document.querySelector('#gpx-step-contents').innerHTML = `<b>Selected: ${
        file.name
    }</b> (${mb.toFixed(2)} MB)`;
    document.querySelector<HTMLDivElement>('#gpx-step-contents').style.textAlign =
        'center';
    $stravaButton.style.display = 'none';
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
$fetchMetadataButton.addEventListener('click', async () => {
    if (inProcessing) {
        // If we're already processing something, ignore the button.
        return;
    }
    hideStepsAfter(1);
    showLoader();
    const input =
        jsonContents != null
            ? { contents: jsonContents, extension: 'json' as const }
            : { contents: await gpxContents, extension: 'gpx' as const };
    send({
        type: MESSAGE_TYPES.FETCH_METADATA,
        input,
        // Kilometers to miles
        frameDensity: $frameDensityInput.valueAsNumber * 1.60934,
    });
    const metadataResult = await waitForResultWithProgress<FetchMetadataResultMessage>(
        MESSAGE_TYPES.FETCH_METADATA_RESULT
    );
    if (!metadataResult) {
        inProcessing = false;
        return;
    }
    hideLoader();
    populateStats(metadataResult);
    showNextStep();
    document.querySelector<HTMLDivElement>('#api-notes').style.display = 'block';
    showNextStep();
    await waitForNextApiKeyChange();
    if (stepIndex === 3) {
        showNextStep();
    }
});

const $gpxStatsList = document.querySelector<HTMLUListElement>('#gpx-stats');
const $costEstimateText = document.querySelector<HTMLSpanElement>('#cost-estimate');
function populateStats(metadataResult: FetchMetadataResultMessage) {
    const { frames, distance, averageError } = metadataResult;
    // TODO put the points on a map as well?
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
const $medBuildButton = document.querySelector<HTMLButtonElement>('#med-button');
const $slowBuildButton = document.querySelector<HTMLButtonElement>('#slow-button');

async function validateToken(token: string): Promise<void> {
    const response = await fetch(
        `https://maps.googleapis.com/maps/api/streetview?size=400x400&location=47.5763831,-122.4211769&fov=80&heading=70&pitch=0&key=${token}`
    );
    if (response.status !== 200) {
        throw new Error(
            `Access key validation failed: ${response.status} - ${
                response.statusText
            }, ${await response.text()}`
        );
    }
}

const handleBuildButton = async (mode: string) => {
    if (inProcessing) {
        return;
    }
    showLoader();
    const apiKey = $apiKeyInput.value;
    try {
        await validateToken(apiKey);
    } catch (e) {
        setLoadingStage((e as Error).message);
        inProcessing = false;
        return;
    }
    const input =
        jsonContents != null
            ? { contents: jsonContents, extension: 'json' as const }
            : { contents: await gpxContents, extension: 'gpx' as const };
    send({
        type: MESSAGE_TYPES.BUILD_HYPERLAPSE,
        apiKey,
        input,
        frameDensity: $frameDensityInput.valueAsNumber,
        mode: mode as 'fast' | 'med' | 'slow',
    });
    const result = await waitForResultWithProgress<BuildHyperlapseResultMessage>(
        MESSAGE_TYPES.BUILD_HYPERLAPSE_RESULT
    );
    inProcessing = false;
    if (result != null) {
        hideLoader();
        document.querySelector<HTMLAnchorElement>('#result-anchor').href = result.url;
        showNextStep();
    }
};

$fastBuildButton.addEventListener('click', () => handleBuildButton('fast'));
$medBuildButton.addEventListener('click', () => handleBuildButton('med'));
$slowBuildButton.addEventListener('click', () => handleBuildButton('slow'));

// STEP 6: SHOW RESULTS
// TODO show video and animation of the map while video plays
// https://docs.mapbox.com/mapbox-gl-js/api/
// https://docs.mapbox.com/mapbox-gl-js/example/geojson-line/
