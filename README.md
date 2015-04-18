heypic.me on node.js
====================

Installation
------------

    npm install hiredis redis express socket.io geocoder

Booting redis
-------------

    redis-server

Booting node
-----------

    # development
    node heypic_streamer.js
    node heypic_processor.js
    node heypic_server.js

    # production
    monit start heypic_streamer
    monit start heypic_processor
    monit start heypic_server
