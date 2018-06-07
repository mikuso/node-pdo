![PHP + PDO + NodeJS](docs/logo.png)

# A bridge for using PHP's PDO within NodeJS

PHP's PDO has a [wide range of database driver support](http://uk1.php.net/manual/en/pdo.drivers.php).  This module brings PDO's functionality to node.

Requires NodeJS >= 4.9.1

This module uses PHP under the hood, so requires PHP (>= 5.0.0) to be installed on the local system.

Your `php.ini` must be configured to enable the PDO drivers you require.

No other dependencies.

Feature requests & bug reports are welcome.

## Install

```
npm i pdo
```

## Example Usage

```js
const PDO = require('pdo');

const db = new PDO()
await db.open(dsn);

await db.query(`
    INSERT INTO users
    SET ?
`, [
    {
        username: "admin",
        password: "hunter2"
    }
]);

await db.query(`
    SELECT *
    FROM users
    WHERE username = ?
    OR id IN (?)
`, [
    "admin",
    [1, 2, 3]
]);

await db.close();
```

## A note on parameterised queries

As with all SQL interfaces, special care should be taken to ensure that all user inputs are correctly sanitised before being included in an SQL query.  PHP's PDO supports parameterised queries to facilitate this, using question marks or colon-prefixed labels as placeholders for query parameters.

This module only supports question mark placeholders at this time, but (unlike PHP's PDO) can also expand objects and arrays as per the example above.

## API

### Methods

### new PDO( options : object )

Available options:

* `expandPlaceholders : bool` - Should queries expand array and object paramters into multiple placeholders? (default: `true`)
* `phpPath : string` - Path to the PHP binary. (default: `'php'`)
* `closeCursorAfterExec : bool` - Automatically call closeCursor() on each statement after execution. Note: Some drivers require this. (default: `false`)
* `stringifyFetches : bool` - Automatically convert all returned values into strings. Note: Some drivers will perform this conversion regardless of this setting. (default: `false`)
* `emulatePrepares : bool` - Should PDO prefer to emulate prepared statements? Note: PDO will *always* emulate prepared statements when not natively supported by your driver. (default: `false`)
* `timeoutSeconds : int` - A query timeout in seconds. Use `0` to disable. (default: `0`)

#### PDO::open( dsn : string ) : Promise

Open a PDO connection.

See http://uk1.php.net/manual/en/pdo.construct.php for information about DSNs.

Returns a Promise resolved when the connection is opened.  
Promise will reject on error.

#### PDO::exec( sql : string [, params : Array] ) : Promise

Executes a query.  
Returns a Promise which resolves when execution is complete.  
Promise will reject on error.

#### PDO::query( sql : string [, params : Array] ) : Promise
#### PDO::queryAll( sql : string [, params : Array] ) : Promise
#### PDO::queryOne( sql : string [, params : Array] ) : Promise
#### PDO::queryColumn( sql : string [, params : Array [, columnIndex = 0 : integer ] ] ) : Promise

Execute a query and return a result.  
Returns a Promise which resolves to the rows returned.  

`PDO::query()` and `PDO::queryAll()` return all rows.  
`PDO::queryOne()` returns a single row.  
`PDO::queryColumn()` returns a single field from a single row.  

Promise will reject on error.

#### PDO::close( ) : Promise

You should always close your PDO connection when no longer needed.  This will allow the underlying PHP process to close, freeing up resources.

#### PDO::on( event : string, handler : function )

PDO is an event emitter.  See below for list of events.

### Events

`error` - fired when an error occurs with the child PHP process.
