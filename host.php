<?php

$db = null;

function dbOpen($connstr) {
    global $db;
    $db = new PDO($connstr);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    return true;
}

function dbExec($sql, $params = array()) {
    global $db;
    if (!isset($db)) {
        throw new Exception("Database not connected");
    }
    $stmt = $db->prepare($sql);
    if (!$params) {
        $params = array();
    }
    foreach ($params as $idx => $val) {
        $stmt->bindValue($idx + 1, $val);
    }
    $stmt->execute();
    return $stmt;
}

function dbQueryOne($sql, $params = array()) {
    $stmt = dbExec($sql, $params);
    return $stmt->fetch(PDO::FETCH_OBJ);
}

function dbQueryAll($sql, $params = array()) {
    $stmt = dbExec($sql, $params);
    return $stmt->fetchAll(PDO::FETCH_OBJ);
}

function toNode($res) {
    $resjson = json_encode($res);
    echo pack("V", strlen($resjson));
    echo $resjson;
}

while(($binlen = fread(STDIN, 4)) !== false){
    $length = unpack('V', $binlen);
    if (!count($length)) {
        return;
    }
    $length = $length[1];
    if (!$length) {
        return;
    }

    $data = fread(STDIN, $length);
    $json = json_decode($data);
    if (is_null($json)) {
        throw new Exception("JSON could not be parsed: {$data}");
    }

    if (!isset($json->cmd)) {
        throw new Exception("No command given");
    }

    if (!isset($json->idx)) {
        throw new Exception("No idx given");
    }

    try {
        ob_start();
        switch ($json->cmd) {
            case 'open': $res = call_user_func_array('dbOpen', $json->params); break;
            case 'exec': $res = call_user_func_array('dbExec', $json->params); break;
            case 'queryOne': $res = call_user_func_array('dbQueryOne', $json->params); break;
            case 'queryAll': $res = call_user_func_array('dbQueryAll', $json->params); break;
            default: throw new Exception("Unexpected command: {$json->cmd}");
        }
        $mess = ob_get_contents();

        if ($mess) {
            throw new Exception("PHP leaked output: {$mess}");
        }

        ob_end_clean();
        toNode(array(
            "idx" => $json->idx,
            "result" => $res
        ));

    } catch (Exception $e) {
        ob_end_clean();
        // send exception back to node
        $error = array(
            "type" => get_class($e),
            "message" => $e->getMessage(),
            "stack" => $e->getTraceAsString(),
        );

        if (isset($e->errorInfo)) {
            $error['sqlState'] = $e->errorInfo[0];
            $error['driverCode'] = $e->errorInfo[1];
            $error['driverMessage'] = $e->errorInfo[2];
        }
        toNode(array(
            "idx" => $json->idx,
            "error" => $error
        ));
    }

    usleep(100000);
}
