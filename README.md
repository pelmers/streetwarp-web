[![Logo](static/logo.png)](https://streetwarp.com/)

## Website: [streetwarp.com](https://streetwarp.com)

## Example:

Click to view:
[![Watch the demo](res/demo_screen.png)](https://github.com/pelmers/streetwarp-web/blob/master/res/demo_result.mp4?raw=true)

### Description

Streetwarp Web is the web-based frontend for
[streetwarp-cli](https://github.com/pelmers/streetwarp-cli), a tool that
produces hyperlapses for GPX routes. This project is simply a web page and
associated server that invokes the command line tool. The live deployment uses
[streetwarp-lambda](https://github.com/pelmers/streetwarp-lambda) running on
[AWS Lambda](https://aws.amazon.com/lambda/) to invoke the tool without loading
the web server.

### Features

-   Connect to Strava, RideWithGPS, or Google Maps, or upload GPX file directly
-   Several output options to trade-off processing speed and result quality
-   Animated route during video playback (using [mapbox](https://www.mapbox.com/))

### Usage

```
git submodule update --init --recursive
yarn
yarn build
node_modules/.bin/ts-node src/server.ts --streetwarp-bin=<location of streetwarp binary> [--debug]
```

The following environment variables should be set:

```
AWS_ACCESS_KEY
AWS_LAMBDA_REGION
GOOGLE_API_KEY (used for metadata requests, which don't incur cost)
STRAVA_CLIENT_ID
STRAVA_REDIRECT_URI
STRAVA_CLIENT_SECRET
MAPBOX_API_KEY
```

### Future Plans

-   None at the moment, feel free to open issues for feature requests
