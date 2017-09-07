# doxel-loopback<br />
This program is part of the DOXEL project <[http://doxel.org](http://doxel.org)>.

Copyright (c) 2015-2017 ALSENET SA - [http://doxel.org](http://doxel.org)<br />
Please read <[http://doxel.org/license](http://doxel.org/license)> for more
information.


## License

This program is licensed under the terms of the
[GNU Affero General Public License v3](http://www.gnu.org/licenses/agpl.html)
(GNU AGPL).

In addition to the common terms of the GNU AGPL v3 license, you are required to:

*   preserve legal notices and author attributions in that material<br />
    or in the Appropriate Legal Notices displayed by works containing it.

*   attribute the work as explained in the Usage and Attribution section of
    <[http://doxel.org/license](http://doxel.org/license)>.

The content is licensed under the terms of the
[Creative Commons Attribution-ShareAlike 4.0 International](http://creativecommons.org/licenses/by-sa/4.0/)
(CC BY-SA) license.

You must read <[http://doxel.org/license](http://doxel.org/license)> for more
information about our Licensing terms and our Usage and Attribution guidelines.


## Included Software and Libraries

This program includes works distributed under the terms of other licenses and other copyright notices.

Read the [COPYRIGHT.md](https://github.com/doxel/doxel-loopback/blob/master/COPYRIGHT.md).


## installation

```

sudo apt-get install build-essential cmake libexpat1-dev mongodb

npm install -g strongloop bower grunt grunt-cli

npm install

lb-ng server/server.js client/app/scripts/lb-services.js

cd client

npm install

bower install

grunt --force

```

## Run

For example:
```
slc start
slc ctl set-size doxel-loopback $(nproc)
slc ctl log-dump doxel-loopback --follow

```

## Debug

For example:

```
[PORT=12345] node --inspect -i -e "require('./server/server.js')"
```

The '-i' option will run the node interpreter in interactive mode, and using -e to load the entry point will ensure that you can effectively use the console and run interactive commands.

You can then access the app object from the terminal with eg:

```
> var loopback=require('loopback')
> var app=loopback.getModel('user').app
```
and optionally start the webserver with
```
> app.start(app.get('enableSSL'));
```


The --inspect options allows attaching Chrome DevTools to nodejs using the URL printed in the console.

Or you can click on the "Open the dedicated DevTool for Node" link displayed on chrome://inspect#devices (You need a recent Chrome or Chromium version >= 58) to attach the DevTools automatically.
