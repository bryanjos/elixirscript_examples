defmodule Ping do
  import JS, only: [defgen: 2, yield: 0, yield: 1]

  defgen start do
    yield await
  end

  defgen await do
    receive do
      {:pong, sender} -> send sender, {:ping, self}
    end
    yield await
  end

end
