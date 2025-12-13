-- meshtastic.lua
-- Wireshark Lua dissector for Stridetastic PCAP-NG captures.
-- Packets carry frame comments like "type=meshtastic.MeshPacket".
-- The dissector uses those hints to drive the protobuf decoder.

-- luacheck: globals Dissector DissectorTable Proto ProtoField Field register_postdissector base ftypes ENC_UTF_8

-------------------------------------------------------------------------------
-- Shared helpers & globals
-------------------------------------------------------------------------------
local nodeinfo_table = {
    ["!FFFFFFFF"] = "Broadcast",
}

local enable_logging = false

local function init_log(tree, proto)
    if not enable_logging then
        return function() end
    end

    local log_tree = tree:add(proto, nil, "Debug Log")
    log_tree:set_generated()

    return function(str)
        log_tree:add(proto):set_text(str)
    end
end

local function format_mac(range)
    return range:bytes():tohex(true, ":"):upper()
end

local protobuf_dissector = Dissector.get("protobuf")
if not protobuf_dissector then
    error("meshtastic.lua: protobuf dissector is unavailable. Enable Wireshark's Protobuf plugin.")
end

local protobuf_field_table = DissectorTable.get("protobuf_field")
local protobuf_names_f = Field.new("protobuf.field.name")
local protobuf_values_f = Field.new("protobuf.field.value")
local frame_comment_f = Field.new("frame.comment")

local function get_message_type_from_comment()
    local comments = { frame_comment_f() }
    for _, comment in ipairs(comments) do
        local msg = tostring(comment):match("type=([%w%.]+)")
        if msg then
            return msg
        end
    end
    return nil
end

local proto_registry = {}
local payload_proto_by_type = {}

local function create_protobuf_dissector(name, msgtype, context)
    if proto_registry[name] then
        return proto_registry[name]
    end

    local description = string.format("%s [%s]", msgtype, context or name)
    local proto = Proto(name, description)
    local f_length = ProtoField.uint32(name .. ".length", "Length", base.DEC)
    proto.fields = { f_length }

    proto.dissector = function(tvb, pinfo, tree)
        local subtree = tree:add(proto, tvb())
        pinfo.private["pb_msg_type"] = "message," .. msgtype
        pcall(Dissector.call, protobuf_dissector, tvb, pinfo, subtree)
        pinfo.columns.protocol:set(name)
    end

    proto_registry[name] = proto
    return proto
end

local function make_pb_handler(msgtype)
    local suffix = msgtype:gsub("^meshtastic%.", ""):gsub("[^%w]", "_")
    local name = "Meshtastic_" .. suffix
    local proto = create_protobuf_dissector(name, msgtype, "frame")
    payload_proto_by_type[msgtype] = proto
    return function(tvb, pinfo, tree)
        proto.dissector(tvb, pinfo, tree)
    end
end

-------------------------------------------------------------------------------
-- Payload (portnum) dissectors
-------------------------------------------------------------------------------
local text_message_proto = Proto("Meshtastic_TextMessage", "Meshtastic TextMessage")
local message_text_field = ProtoField.new("Message", "meshtastic.text", ftypes.STRING)
text_message_proto.fields = { message_text_field }
text_message_proto.dissector = function(tvb, pinfo, tree)
    local subtree = tree:add(text_message_proto, tvb())
    local text = tvb():string(ENC_UTF_8)
    subtree:add(message_text_field, text)
    if text and text ~= "" and pinfo.columns and pinfo.columns.info then
        local truncated = text
        if #truncated > 120 then
            truncated = truncated:sub(1, 117) .. "..."
        end
        pinfo.columns.info:set(truncated)
    end
    pinfo.columns.protocol:set("Meshtastic_Payload_TextMessage")
end

payload_proto_by_type["meshtastic.TextMessage"] = text_message_proto
payload_proto_by_type["text/plain; charset=utf-8"] = text_message_proto
payload_proto_by_type["text/plain"] = text_message_proto

local payload_dissectors = {
    ["01"] = text_message_proto,
}

local function add_payload_dissector(portnum, suffix, msgtype)
    local key = string.format("port_%s", suffix)
    local name = "Meshtastic_Payload_" .. suffix
    local proto = create_protobuf_dissector(name, msgtype, key)
    payload_dissectors[string.format("%02X", portnum)] = proto
    payload_proto_by_type[msgtype] = proto
    return proto
end

add_payload_dissector(2,   "RemoteHardware",  "meshtastic.HardwareMessage")
add_payload_dissector(3,   "Position",        "meshtastic.Position")
add_payload_dissector(4,   "NodeInfo",        "meshtastic.NodeInfo")
add_payload_dissector(5,   "Routing",         "meshtastic.Routing")
add_payload_dissector(6,   "Admin",           "meshtastic.AdminMessage")
add_payload_dissector(7,   "Compressed",      "meshtastic.Compressed")
add_payload_dissector(8,   "Waypoint",        "meshtastic.Waypoint")
add_payload_dissector(10,  "Sensor",          "meshtastic.SensorData")
add_payload_dissector(11,  "Alert",           "meshtastic.ClientNotification")
add_payload_dissector(12,  "KeyVerification", "meshtastic.KeyVerification")
add_payload_dissector(34,  "Paxcounter",      "meshtastic.Paxcount")
add_payload_dissector(65,  "StoreForward",    "meshtastic.StoreAndForward")
add_payload_dissector(66,  "RangeTest",       "meshtastic.PowerStressMessage")
add_payload_dissector(67,  "Telemetry",       "meshtastic.Telemetry")
add_payload_dissector(70,  "RouteDiscovery",  "meshtastic.RouteDiscovery")
add_payload_dissector(71,  "NeighborInfo",    "meshtastic.NeighborInfo")
add_payload_dissector(72,  "AtakPlugin",      "meshtastic.TAKPacket")
add_payload_dissector(73,  "Map",             "meshtastic.Map")
add_payload_dissector(74,  "PowerMon",        "meshtastic.PowerMon")
add_payload_dissector(77,  "Cayenne",         "meshtastic.ModuleConfig")
add_payload_dissector(257, "AtakForwarder",   "meshtastic.TAKPacket")

local payload_proto = Proto("Meshtastic_Payload", "Meshtastic Payload (portnum)")
payload_proto.dissector = function(tvb, pinfo, tree)
    local names  = { protobuf_names_f() }
    local values = { protobuf_values_f() }
    if #names == 0 then
        return
    end

    for idx, finfo_name in ipairs(names) do
        if tostring(finfo_name) == "portnum" then
            local finfo_val = values[idx]
            local port_hex = string.format("%02X", finfo_val.range:uint())
            local dissector = payload_dissectors[port_hex]
            if dissector then
                pinfo.columns.protocol = dissector.name
                pcall(Dissector.call, dissector.dissector, tvb, pinfo, tree)
                return
            end
        end
    end
end

protobuf_field_table:add("meshtastic.Data.payload", payload_proto)

-------------------------------------------------------------------------------
-- Core handlers
-------------------------------------------------------------------------------
local meshpacket_proto = create_protobuf_dissector("Meshtastic_MeshPacket", "meshtastic.MeshPacket", "frame")
local data_proto       = create_protobuf_dissector("Meshtastic_Data",       "meshtastic.Data", "frame")

local function update_columns_and_tables(tree, pinfo)
    local log = init_log(tree, meshpacket_proto)

    local names  = { protobuf_names_f() }
    local values = { protobuf_values_f() }
    if #names == 0 then
        return
    end

    local map = {}
    for idx, finfo_name in ipairs(names) do
        map[tostring(finfo_name)] = values[idx]
        log(tostring(finfo_name) .. ": " .. values[idx].display)
    end

    if map["from"] then
        pinfo.columns.src:set(string.format("!%08X", map["from"].range:le_uint()))
    end
    if map["to"] then
        pinfo.columns.dst:set(string.format("!%08X", map["to"].range:le_uint()))
    end

    if map["long_name"] then
        local key
        if map["from"] then
            key = string.format("!%08X", map["from"].range:le_uint())
        elseif map["id"] then
            key = string.upper(map["id"].range:string())
        end
        if key then
            nodeinfo_table[key] = map["long_name"].range:string(ENC_UTF_8)
        end
    end
end

local function dissect_meshpacket(tvb, pinfo, tree)
    meshpacket_proto.dissector(tvb, pinfo, tree)
    update_columns_and_tables(tree, pinfo)
end

local function dissect_data(tvb, pinfo, tree)
    data_proto.dissector(tvb, pinfo, tree)
end

local handler_map = {
    ["meshtastic.MeshPacket"]          = dissect_meshpacket,
    ["meshtastic.protobuf.MeshPacket"] = dissect_meshpacket,
    ["meshtastic.Data"]                = dissect_data,
    ["meshtastic.protobuf.Data"]       = dissect_data,
    ["meshtastic.TextMessage"]         = text_message_proto.dissector,
    ["meshtastic.protobuf.TextMessage"] = text_message_proto.dissector,
}

local function register_pb_handler(msgtype, aliases)
    local proto = payload_proto_by_type[msgtype]
    local handler

    if proto then
        handler = function(tvb, pinfo, tree)
            proto.dissector(tvb, pinfo, tree)
        end
    else
        handler = make_pb_handler(msgtype)
        proto = payload_proto_by_type[msgtype]
    end

    handler_map[msgtype] = handler

    if aliases then
        for _, alias in ipairs(aliases) do
            handler_map[alias] = handler
            if proto then
                payload_proto_by_type[alias] = proto
            end
        end
    end
end

register_pb_handler("meshtastic.User", { "meshtastic.protobuf.User" })
register_pb_handler("meshtastic.NodeInfo", { "meshtastic.protobuf.NodeInfo" })
register_pb_handler("meshtastic.Position", { "meshtastic.protobuf.Position" })
register_pb_handler("meshtastic.Telemetry", { "meshtastic.protobuf.Telemetry" })
register_pb_handler("meshtastic.Routing", { "meshtastic.protobuf.Routing" })
register_pb_handler("meshtastic.AdminMessage", { "meshtastic.protobuf.AdminMessage" })
register_pb_handler("meshtastic.Waypoint", { "meshtastic.protobuf.Waypoint" })
register_pb_handler("meshtastic.RouteDiscovery", { "meshtastic.protobuf.RouteDiscovery" })
register_pb_handler("meshtastic.NeighborInfo", { "meshtastic.protobuf.NeighborInfo" })
register_pb_handler("meshtastic.Paxcount", { "meshtastic.protobuf.Paxcount" })
register_pb_handler("meshtastic.StoreAndForward", { "meshtastic.protobuf.StoreAndForward" })
register_pb_handler("meshtastic.HardwareMessage", { "meshtastic.protobuf.HardwareMessage" })
register_pb_handler("meshtastic.SensorData", { "meshtastic.protobuf.SensorData" })
register_pb_handler("meshtastic.ClientNotification", { "meshtastic.protobuf.ClientNotification" })
register_pb_handler("meshtastic.KeyVerification", { "meshtastic.protobuf.KeyVerification" })
register_pb_handler("meshtastic.KeyVerificationNumberRequest", { "meshtastic.protobuf.KeyVerificationNumberRequest" })
register_pb_handler("meshtastic.KeyVerificationNumberInform", { "meshtastic.protobuf.KeyVerificationNumberInform" })
register_pb_handler("meshtastic.KeyVerificationFinal", { "meshtastic.protobuf.KeyVerificationFinal" })
register_pb_handler("meshtastic.PowerStressMessage", { "meshtastic.protobuf.PowerStressMessage" })
register_pb_handler("meshtastic.PowerMon", { "meshtastic.protobuf.PowerMon" })
register_pb_handler("meshtastic.TAKPacket", { "meshtastic.protobuf.TAKPacket" })
register_pb_handler("meshtastic.Map", { "meshtastic.protobuf.Map" })
register_pb_handler("meshtastic.ModuleConfig", { "meshtastic.protobuf.ModuleConfig" })
register_pb_handler("meshtastic.Compressed", { "meshtastic.protobuf.Compressed" })

handler_map["text/plain; charset=utf-8"] = text_message_proto.dissector
handler_map["text/plain"] = text_message_proto.dissector

-------------------------------------------------------------------------------
-- Dispatcher registered on our DLT
-------------------------------------------------------------------------------
local meshtastic_proto = Proto("meshtastic", "Meshtastic Capture")

meshtastic_proto.dissector = function(tvb, pinfo, tree)
    local subtree = tree:add(meshtastic_proto, tvb())
    local msg_type = get_message_type_from_comment() or "meshtastic.MeshPacket"
    local handler = handler_map[msg_type] or handler_map["meshtastic.MeshPacket"]
    handler(tvb, pinfo, subtree)
end

-------------------------------------------------------------------------------
-- Post-dissector for friendly names and MACs
-------------------------------------------------------------------------------
local nodeinfo_proto = Proto("Meshtastic_NodeInfo", "Meshtastic Node Labels")
local nodeinfo_from_field = ProtoField.string("meshtastic.src_long_name", "Sender")
local nodeinfo_to_field   = ProtoField.string("meshtastic.dst_long_name", "Receiver")
local nodeinfo_mac_field  = ProtoField.string("meshtastic.src_mac", "Sender MAC")
nodeinfo_proto.fields = { nodeinfo_from_field, nodeinfo_to_field, nodeinfo_mac_field }

nodeinfo_proto.dissector = function(tvb, pinfo, tree)
    local subtree = tree:add(nodeinfo_proto, tvb())

    local names  = { protobuf_names_f() }
    local values = { protobuf_values_f() }
    if #names == 0 then
        return
    end

    local map = {}
    for idx, finfo_name in ipairs(names) do
        map[tostring(finfo_name)] = values[idx]
    end

    local from_addr
    if map["from"] then
        from_addr = string.format("!%08X", map["from"].range:le_uint())
        pinfo.columns.src:set(from_addr)
    end

    local to_addr
    if map["to"] then
        to_addr = string.format("!%08X", map["to"].range:le_uint())
        pinfo.columns.dst:set(to_addr)
    end

    if from_addr and nodeinfo_table[from_addr] then
        subtree:add(nodeinfo_from_field, nodeinfo_table[from_addr])
    end
    if to_addr and nodeinfo_table[to_addr] then
        subtree:add(nodeinfo_to_field, nodeinfo_table[to_addr])
    end
    if map["macaddr"] then
        subtree:add(nodeinfo_mac_field, format_mac(map["macaddr"].range))
    end
end

register_postdissector(nodeinfo_proto)

-------------------------------------------------------------------------------
-- Register for DLT_USER15 (DLT = 162)
-------------------------------------------------------------------------------
local mesh_dlt = DissectorTable.get("wtap_encap")
if not mesh_dlt then
    error("meshtastic.lua: could not acquire 'wtap_encap' dissector table; check your Wireshark build.")
end
mesh_dlt:add(162, meshtastic_proto)
