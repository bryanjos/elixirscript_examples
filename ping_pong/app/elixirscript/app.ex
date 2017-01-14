defmodule App do
  import JS, only: [defgen: 2, yield: 0, yield: 1]
  @on_js_load :main

  defgen main() do
    ping = JS.yield spawn_link(Ping, :start, [])
    pong = JS.yield spawn_link(Pong, :start, [])

    send(pong, {:ping, ping})
  end
end
