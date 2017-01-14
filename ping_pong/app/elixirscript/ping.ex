defmodule Ping do
  import JS, only: [defgen: 2, yield: 0, yield: 1]

  defgen start do
    JS.yield awai
  end

  defgen awai do
    receive do
      {:pong, sender} -> send sender, {:ping, self}
    end
    JS.yield awai
  end

end
