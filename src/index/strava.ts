import { getStravaStatus, loadStravaActivity } from '../common/socket-client';
import { TLoadStravaActivityOutput } from '../rpcCalls';

const STRAVA_CLIENT_ID = '17747';
const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize';
const STRAVA_REDIRECT_SERVER_URL =
    'https://gpxspliceredirect.pelmers.com/shared';
const STRAVA_SCOPES = 'read,read_all,activity:read,activity:read_all';

function stravaAuthURL() {
    const callbackURL = new URL(window.location.href);
    callbackURL.search = '';
    callbackURL.hash = '';

    const redirectURI =
        `${STRAVA_REDIRECT_SERVER_URL}/client_uri/` +
        encodeURIComponent(callbackURL.toString());
    const params = new URLSearchParams({
        client_id: STRAVA_CLIENT_ID,
        redirect_uri: redirectURI,
        response_type: 'code',
        approval_prompt: 'auto',
        scope: STRAVA_SCOPES,
    });
    return `${STRAVA_AUTH_URL}?${params.toString()}`;
}

function parsePayload(payload: string) {
    const stravaResponse = JSON.parse(payload);
    if (!stravaResponse.access_token) {
        throw new Error('Strava token response did not include an access token');
    }
    return {
        result: {
            profile: {
                token: stravaResponse.access_token,
                profileURL: stravaResponse.athlete.profile,
                name: stravaResponse.athlete.firstname,
            },
        },
    };
}

export async function getStravaResult(onError?: (e: Error) => void) {
    const params = new URLSearchParams(window.location.search);
    try {
        const payload = params.get('payload');
        const error = params.get('error');
        if (error) {
            throw new Error(error);
        } else if (payload) {
            return parsePayload(payload);
        } else if (params.get('code') && params.get('scope')) {
            return await getStravaStatus({
                response: {
                    code: params.get('code'),
                    acceptedScopes: params.get('scope'),
                },
            });
        }
    } catch (e) {
        onError && onError(e);
    }
    return {
        result: {
            requestURL: stravaAuthURL(),
        },
    };
}

export async function loadActivity(
    value: string,
    stravaAccessToken: string
): Promise<TLoadStravaActivityOutput> {
    const idRegex = /\/(\d+)/;
    const match = idRegex.exec(value)[1];
    const isRoute = value.indexOf('route') >= 0;
    if (!match) {
        throw new Error('no match for id in URL');
    }
    return loadStravaActivity({
        t: isRoute ? 'route' : 'activity',
        id: match,
        token: stravaAccessToken,
    });
}
