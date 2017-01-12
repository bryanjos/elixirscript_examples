defmodule App do
  require JS
  @on_js_load :main

  def main() do
    ping = spawn_link(Ping, :start, [])
    pong = spawn_link(Pong, :start, [])
    send(pong, {:ping, ping})
  end
end
