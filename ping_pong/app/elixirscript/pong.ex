defmodule Pong do
  import JS, only: [defgen: 2, yield: 0, yield: 1]

  defgen start do
    yield await(0)
  end

  defgen await(counter) do
    receive do
      {:ping, sender} -> send sender, {:pong, self}
    end
    :console.log("echo received #{counter} times")
    yield await(counter + 1)
  end

end
